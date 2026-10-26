(function () {
  'use strict';
  const C = window.PlannerCore, $ = id => document.getElementById(id);
  const hosted = !!(window.google && google.script && google.script.run);
  if (!hosted && window.PLANNER_CONFIG?.webAppUrl) {
    try {
      const url = new URL(window.PLANNER_CONFIG.webAppUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) || url.username || url.password) throw new Error('주소 확인 필요');
      window.location.replace(url.href); return;
    } catch (_) {
      document.getElementById('login-message').textContent = 'config.js에 등록한 Apps Script 배포 주소를 확인해 주세요.';
    }
  }
  const state = { date: C.today(), month: C.today().slice(0, 7), mode: 'month', markdown: '', version: 0, revision: 0,
    dirty: false, token: '', summary: [], conflict: null, loading: false, active: false };
  let saveTimer, saving, editingEvent, navigation = 0, toastTimer;
  const demo = new Map();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const sessionKey = 'private-planner-session-v1';
  function tokenStorage(value) {
    try {
      if (value === undefined) return sessionStorage.getItem(sessionKey) || '';
      if (value) sessionStorage.setItem(sessionKey, value); else sessionStorage.removeItem(sessionKey);
    } catch (_) { /* Storage restrictions in an embedded browser must not break login. */ }
    return '';
  }
  function el(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function inline(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|\[\[[^\]]+\]\])/g;
    let last = 0;
    for (const match of String(text).matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(last, match.index)));
      const value = match[0];
      if (value.startsWith('**')) parent.append(el('strong', '', value.slice(2, -2)));
      else if (value.startsWith('~~')) parent.append(el('s', '', value.slice(2, -2)));
      else parent.append(el('span', 'inline-wiki', value));
      last = match.index + value.length;
    }
    parent.append(document.createTextNode(text.slice(last)));
  }
  function error(message) { $('error-banner').textContent = String(message); $('error-banner').hidden = false; }
  function clearError() { $('error-banner').hidden = true; $('error-banner').textContent = ''; }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }
  function busy(value) {
    state.loading = value; $('workspace').setAttribute('aria-busy', String(value));
    $('save-button').disabled = value; $('add-event').disabled = value;
  }
  function status(text) { $('save-state').textContent = text; }
  function rpc(method, ...args) {
    if (hosted) return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(e => reject(new Error(e.message || String(e))))[method](...args);
    });
    const [, value] = args;
    if (method === 'loadPlannerDay') return Promise.resolve(demo.get(value) || { date: value, markdown: '', version: 0 });
    if (method === 'loadPlannerMonth') return Promise.resolve([...demo.values()].filter(n => n.date.startsWith(value)).map(n => ({ date: n.date, version: n.version })));
    if (method === 'savePlannerDay') {
      const old = demo.get(value.date);
      if ((old?.version || 0) !== value.expectedVersion) return Promise.resolve({ conflict: true, latest: old });
      const note = { date: value.date, markdown: value.markdown, version: value.expectedVersion + 1, updatedAt: new Date().toISOString() };
      demo.set(note.date, note); return Promise.resolve({ conflict: false, note });
    }
    if (method === 'exportPlannerNotes') return Promise.resolve([...demo.values()]);
    return Promise.reject(new Error('저장소가 연결되어 있지 않습니다.'));
  }
  function seedDemo() {
    const date = C.today();
    for (const [offset, lines] of [
      [0, '- [ ] 09:00 - 10:00 자료 정리\n\t- 참고 자료 분류\n\n- [ ] 14:00 - 15:30 **논문 읽기**\n\t- [[연구 메모]]\n\n- [ ] 18:00 - 18:30 산책\n'],
      [-1, '- [x] 10:00 - 11:00 주간 계획 확인\n'], [2, '- [ ] 15:00 - 16:00 회의\n']
    ]) {
      const d = C.shiftDate(date, offset);
      demo.set(d, { date: d, markdown: C.template(d).replace('**\\[TODO', lines + '\n**\\[TODO') + '- 참고문헌 정리\n- 메일 확인\n', version: 1 });
    }
  }
  function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
  function from64(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
  async function passwordProof(password, challenge) {
    if (!crypto.subtle) throw new Error('보안 연결(HTTPS)에서 열어 주세요.');
    if (challenge.iterations !== 600000 || from64(challenge.salt).length !== 32 || !/^[a-f0-9]{64}$/.test(challenge.id) || !/^[a-f0-9]{64}$/.test(challenge.nonce)) throw new Error('로그인 설정을 확인해 주세요.');
    const encoder = new TextEncoder();
    const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: from64(challenge.salt), iterations: challenge.iterations, hash: 'SHA-256' }, source, 256);
    const key = await crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    new Uint8Array(bits).fill(0);
    return b64(await crypto.subtle.sign('HMAC', key, encoder.encode(challenge.id + ':' + challenge.nonce)));
  }
  async function login(event) {
    event.preventDefault(); $('login-message').textContent = ''; $('login-button').disabled = true;
    try {
      if (!hosted) { seedDemo(); await unlock(''); return; }
      const challenge = await rpc('getPlannerLoginChallenge');
      const proof = await passwordProof($('password').value, challenge); $('password').value = '';
      const result = await rpc('loginPlanner', { id: challenge.id, proof });
      tokenStorage(result.token); await unlock(result.token);
    } catch (e) { $('login-message').textContent = e.message; }
    finally { $('password').value = ''; $('login-button').disabled = false; }
  }
  async function unlock(token) {
    state.token = token;
    // Verify a saved session before making any private content visible.
    state.summary = await rpc('loadPlannerMonth', token, state.month);
    state.active = true; $('login-view').hidden = true; $('planner-view').hidden = false;
    $('preview-banner').hidden = hosted; $('connection-label').textContent = hosted ? '연결됨' : '미리보기';
    $('mini-calendar-panel').open = false;
    await selectDate(state.date, 'month');
  }
  function showLocked(message) {
    state.active = false; state.token = ''; tokenStorage(''); clearTimeout(saveTimer);
    state.markdown = ''; state.dirty = false; state.conflict = null; navigation++;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    for (const id of ['timeline', 'timechart', 'todo-list', 'mini-grid', 'month-grid', 'week-strip']) $(id).replaceChildren();
    $('timechart-range').textContent = '';
    for (const id of ['event-title', 'event-notes', 'markdown-input', 'todo-input']) $(id).value = '';
    $('planner-view').hidden = true; $('login-view').hidden = false; $('conflict-panel').hidden = true;
    $('error-banner').hidden = true; $('login-message').textContent = message || ''; state.summary = [];
    $('password').focus();
  }
  async function lock() {
    if (document.querySelector('dialog[open]') && !confirm('적용하지 않은 내용이 있습니다. 편집을 취소하고 잠글까요?')) return;
    if (!await save()) return;
    try { if (hosted) await rpc('logoutPlanner', state.token); }
    catch (e) { if (!e.message.includes('AUTH_REQUIRED')) { error('로그아웃하지 못했습니다. 인터넷 연결을 확인해 주세요.'); return; } }
    showLocked();
  }
  function authError(e) {
    if (!String(e.message).includes('AUTH_REQUIRED')) return false;
    showLocked('로그인이 만료되었습니다. 다시 로그인해 주세요.'); return true;
  }
  function changed(markdown) {
    if (!state.active || state.loading) return;
    state.markdown = markdown; state.revision++; state.dirty = true;
    status('저장 대기 중'); renderDay();
    clearTimeout(saveTimer); saveTimer = setTimeout(() => { save(); }, 650);
  }
  async function save() {
    clearTimeout(saveTimer);
    if (saving) return saving;
    if (state.conflict) return false;
    if (!state.dirty) return true;
    saving = (async () => {
      try {
        while (state.dirty && state.active) {
          status('저장 중…');
          const revision = state.revision, markdown = state.markdown, date = state.date;
          if (new TextEncoder().encode(markdown).length > 24000) throw new Error('하루 기록은 24KB까지 저장할 수 있습니다. 원문을 줄이거나 내보내 주세요.');
          const result = await rpc('savePlannerDay', state.token, { date, markdown, expectedVersion: state.version });
          if (result.conflict) {
            state.conflict = result.latest; $('conflict-panel').hidden = false; status('다른 기기의 수정 확인 필요'); return false;
          }
          state.version = result.note.version; state.dirty = revision !== state.revision;
          const old = state.summary.findIndex(n => n.date === date);
          if (old < 0) state.summary.push({ date, version: state.version }); else state.summary[old].version = state.version;
          renderCalendars();
        }
        status(hosted ? '저장 완료' : '임시 저장'); return true;
      } catch (e) {
        if (!authError(e)) { status('저장 실패'); error(e.message + ' 입력한 내용은 화면에 남아 있습니다. 다시 저장하거나 .md 파일로 내려받아 주세요.'); }
        return false;
      }
    })();
    try { return await saving; } finally { saving = null; }
  }
  async function selectDate(date, mode = 'day') {
    if (!C.validDate(date) || !state.active) return false;
    if (!await save()) return false;
    const request = ++navigation; busy(true); clearError();
    try {
      const note = await rpc('loadPlannerDay', state.token, date);
      const month = date.slice(0, 7);
      const summary = await rpc('loadPlannerMonth', state.token, month);
      if (request !== navigation || !state.active) return;
      state.date = date; state.month = month; state.summary = summary;
      state.markdown = note.version ? note.markdown : C.template(date); state.version = note.version;
      state.dirty = false; state.revision = 0; state.mode = mode;
      $('mini-calendar-panel').open = false;
      renderCalendars(); renderDay(); renderView(); status(hosted ? '저장 완료' : '임시 저장');
      return true;
    } catch (e) { if (!authError(e)) error(e.message); }
    finally { if (request === navigation) busy(false); }
  }
  async function moveMonth(delta) {
    if (!state.active || state.loading) return;
    if (!await save()) return;
    const [y, m] = state.month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
    const month = d.toISOString().slice(0, 7); if (!C.validDate(month + '-01')) return;
    const request = ++navigation; busy(true); clearError();
    try {
      const summary = await rpc('loadPlannerMonth', state.token, month);
      if (request !== navigation || !state.active) return;
      state.summary = summary; state.month = month; renderCalendars();
    }
    catch (e) { if (!authError(e)) error(e.message); }
    finally { if (request === navigation) busy(false); }
  }
  function renderView() {
    $('month-view').hidden = state.mode !== 'month'; $('day-view').hidden = state.mode !== 'day';
    $('show-month').classList.toggle('active', state.mode === 'month'); $('show-day').classList.toggle('active', state.mode === 'day');
    $('show-month').setAttribute('aria-current', state.mode === 'month' ? 'page' : 'false');
    $('show-day').setAttribute('aria-current', state.mode === 'day' ? 'page' : 'false');
    $('workspace-kicker').textContent = state.mode === 'month' ? '월간 일정' : '일별 기록';
  }
  function renderCalendars() {
    const [year, month] = state.month.split('-').map(Number);
    const label = `${year}년 ${month}월`; $('month-title').textContent = label;
    document.querySelectorAll('.month-label').forEach(e => { e.textContent = label; });
    const start = C.week(state.month + '-01')[0], records = new Set(state.summary.map(n => n.date));
    $('mini-grid').replaceChildren(); $('month-grid').replaceChildren();
    for (let i = 0; i < 42; i++) {
      const date = C.shiftDate(start, i), outside = date.slice(0, 7) !== state.month;
      for (const mini of [true, false]) {
        const button = el('button', mini ? 'mini-day' : 'month-day'); button.type = 'button';
        button.classList.toggle('outside', outside); button.classList.toggle('today', date === C.today());
        button.classList.toggle('has-note', records.has(date));
        if (mini) { button.textContent = String(+date.slice(8)); button.classList.toggle('selected', date === state.date && state.mode === 'day'); }
        else {
          button.append(el('span', 'day-number', String(+date.slice(8))));
          if (records.has(date)) { button.append(el('span', 'note-label', '기록 있음'), el('span', 'note-dot')); }
        }
        button.setAttribute('aria-label', date + (records.has(date) ? ', 기록 있음' : ', 기록하기'));
        button.addEventListener('click', () => selectDate(date)); (mini ? $('mini-grid') : $('month-grid')).append(button);
      }
    }
    $('month-count').textContent = `기록 ${records.size}일`;
  }
  function checkButton(checked, label, callback) {
    const button = el('button', 'check-button' + (checked ? ' checked' : ''), checked ? '✓' : '');
    button.type = 'button'; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(checked));
    button.addEventListener('click', callback); return button;
  }
  function renderDay() {
    const { events, todos, duration, completed } = C.parse(state.markdown);
    const date = new Date(state.date + 'T12:00:00Z');
    $('day-title').textContent = `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
    $('day-subtitle').textContent = `${date.getUTCFullYear()}년 · ${weekdays[date.getUTCDay()]}요일${state.date === C.today() ? ' · 오늘' : ''}`;
    $('week-strip').replaceChildren();
    for (const day of C.week(state.date)) {
      const d = new Date(day + 'T12:00:00Z'), button = el('button', 'week-day'); button.type = 'button';
      button.append(el('small', '', weekdays[d.getUTCDay()]), el('strong', '', String(d.getUTCDate())));
      button.classList.toggle('selected', day === state.date); button.classList.toggle('today', day === C.today());
      button.setAttribute('aria-label', day); button.addEventListener('click', () => selectDate(day)); $('week-strip').append(button);
    }
    function metric(id, n, unit) { $(id).replaceChildren(document.createTextNode(String(n)), el('span', '', unit)); }
    metric('stat-events', events.length, '개'); metric('stat-hours', Math.round(duration / 6) / 10, '시간'); metric('stat-completed', completed, '개');
    const pct = events.length ? Math.round(completed / events.length * 100) : 0;
    $('progress-fill').style.width = pct + '%'; $('progress-label').textContent = events.length ? `${pct}% 완료` : '등록된 일정 없음';
    $('timeline').replaceChildren();
    if (!events.length) {
      $('timeline').append(el('p', 'empty-state', '등록된 일정이 없습니다.'));
    }
    for (const event of events.slice().sort((a, b) => C.minutes(a.start) - C.minutes(b.start))) {
      const row = el('div', 'timeline-item' + (event.checked ? ' done' : ''));
      const time = el('div', 'event-time', event.start); time.append(el('span', '', event.end));
      const content = el('div'), title = el('div', 'event-title'); inline(title, event.title); content.append(title);
      if (event.notes) { const notes = el('div', 'event-notes'); inline(notes, event.notes); content.append(notes); }
      const edit = el('button', 'event-edit', '⋯'); edit.type = 'button'; edit.setAttribute('aria-label', event.title + ' 수정'); edit.addEventListener('click', () => editEvent(event));
      row.append(time, checkButton(event.checked, event.title + ' 완료', () => changed(C.toggleEvent(state.markdown, event.line))), content, edit); $('timeline').append(row);
    }
    $('todo-list').replaceChildren();
    for (const todo of todos) {
      const row = el('div', 'todo-item' + (todo.checked ? ' done' : '')), content = el('div'), title = el('div', 'todo-title'); inline(title, todo.title); content.append(title);
      if (todo.notes) { const notes = el('div', 'event-notes'); inline(notes, todo.notes); content.append(notes); }
      const remove = el('button', 'todo-delete', '×'); remove.type = 'button'; remove.setAttribute('aria-label', todo.title + ' 삭제');
      remove.addEventListener('click', () => { if (confirm('이 할 일을 삭제할까요?')) changed(C.replaceBlock(state.markdown, todo.line, todo.endLine, '')); });
      row.append(checkButton(todo.checked, todo.title + ' 완료', () => changed(C.toggleTodo(state.markdown, todo.line))), content, remove); $('todo-list').append(row);
    }
    if (!todos.length) $('todo-list').append(el('p', 'empty-state', '등록된 할 일이 없습니다.'));
    $('todo-count').textContent = `${todos.filter(t => t.checked).length}/${todos.length}`;
    renderTimechart(events);
  }
  function renderTimechart(events) {
    const container = $('timechart'); container.replaceChildren();
    $('timechart-help').hidden = !events.length;
    if (!events.length) {
      $('timechart-range').textContent = '';
      container.append(el('p', 'empty-state', '일정을 추가하면 타임라인에 표시됩니다.')); return;
    }
    const layout = C.layoutTimeline(events), hourHeight = 56;
    const clock = value => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    const label = value => (value >= 2880 ? '이틀 뒤 ' : value >= 1440 ? '다음날 ' : '') + clock(value);
    const plain = text => text.replace(/\*\*|~~/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1');
    $('timechart-range').textContent = `${label(layout.start)}–${label(layout.end)}`;
    const track = el('div', 'timechart-track');
    track.style.height = `${(layout.end - layout.start) * hourHeight / 60}px`;
    track.style.minWidth = `${Math.max(...layout.slots.map(s => s.columns)) * 115}px`;
    for (let minute = layout.start; minute <= layout.end; minute += 60) {
      const tick = el('span', 'timechart-tick');
      if (minute >= 1440) tick.append(el('small', '', '다음날'));
      tick.append(document.createTextNode(clock(minute)));
      tick.style.top = `${(minute - layout.start) * hourHeight / 60}px`; track.append(tick);
    }
    for (const slot of layout.slots) {
      const { event, start, end, displayEnd, column, columns } = slot;
      const block = el('button', 'timechart-event' + (event.checked ? ' done' : '') + (displayEnd - start < 60 ? ' compact' : ''));
      block.type = 'button';
      block.style.top = `${(start - layout.start) * hourHeight / 60}px`;
      block.style.height = `${(displayEnd - start) * hourHeight / 60 - 2}px`;
      block.style.left = `calc(${column * 100 / columns}% + 4px)`;
      block.style.width = `calc(${100 / columns}% - 8px)`;
      const range = `${label(start)}–${label(end)}`;
      block.title = `${range} ${plain(event.title)}`;
      block.setAttribute('aria-label', `${range} ${plain(event.title)}${event.checked ? ', 완료' : ''}, 수정`);
      block.append(el('strong', 'timechart-event-title', (event.checked ? '✓ ' : '') + plain(event.title)), el('span', 'timechart-event-time', range));
      block.addEventListener('click', () => editEvent(event)); track.append(block);
    }
    container.append(track);
  }
  function editEvent(event) {
    if (state.loading) return;
    editingEvent = event || null;
    $('event-dialog-title').textContent = event ? '일정 수정' : '일정 추가';
    $('event-start').value = event?.start || '09:00'; $('event-end').value = event?.end || '10:00';
    $('event-title').value = event?.title || ''; $('event-notes').value = event?.notes || '';
    $('delete-event').hidden = !event; $('event-dialog').showModal(); $('event-title').focus();
  }
  function download(blob, filename) {
    const link = document.createElement('a'), url = URL.createObjectURL(blob);
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportDay(suffix = '') { download(new Blob([state.markdown], { type: 'text/markdown;charset=utf-8' }), state.date + suffix + '.md'); }
  async function exportAll() {
    if (!await save()) return;
    $('export-all').disabled = true;
    try {
      const notes = await rpc('exportPlannerNotes', state.token);
      if (!notes.length) { toast('아직 저장된 기록이 없습니다.'); return; }
      download(C.zipNotes(notes), `Planner-${C.today()}.zip`); toast(`${notes.length}일치 기록을 내보냈습니다.`);
    } catch (e) { if (!authError(e)) error(e.message); }
    finally { $('export-all').disabled = false; }
  }
  async function importFile() {
    const file = $('import-file').files[0]; if (!file) return;
    try {
      const date = file.name.replace(/\.md$/i, '');
      if (!C.validDate(date)) throw new Error('2026-10-26.md처럼 날짜 이름의 파일을 선택해 주세요.');
      if (file.size > 24000) throw new Error('24KB 이하의 Markdown 파일을 선택해 주세요.');
      const text = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      if (!await selectDate(date)) return;
      if (state.version && !confirm('해당 날짜에 기록이 있습니다. 가져온 내용으로 바꿀까요?')) return;
      changed(text); toast('기록을 가져왔습니다. 원본 파일은 변경하지 않았습니다.');
    } catch (e) { error(e.message); }
    finally { $('import-file').value = ''; }
  }
  $('login-form').addEventListener('submit', login);
  $('show-month').addEventListener('click', async () => { if (await save()) { state.mode = 'month'; renderCalendars(); renderView(); } });
  $('show-day').addEventListener('click', () => selectDate(C.today()));
  document.querySelectorAll('.month-prev').forEach(b => b.addEventListener('click', () => moveMonth(-1)));
  document.querySelectorAll('.month-next').forEach(b => b.addEventListener('click', () => moveMonth(1)));
  document.querySelectorAll('.today-button').forEach(b => b.addEventListener('click', () => selectDate(C.today(), state.mode)));
  $('refresh').addEventListener('click', () => selectDate(state.date, state.mode));
  $('logout').addEventListener('click', lock); $('save-button').addEventListener('click', () => { clearError(); save(); });
  $('add-event').addEventListener('click', () => editEvent());
  $('event-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const next = C.upsertEvent(state.markdown, { start: $('event-start').value, end: $('event-end').value, title: $('event-title').value, notes: $('event-notes').value, checked: editingEvent?.checked || false }, editingEvent);
      $('event-dialog').close(); changed(next);
    } catch (e) { error(e.message); }
  });
  $('delete-event').addEventListener('click', () => {
    if (!editingEvent || !confirm('이 일정을 삭제할까요?')) return;
    const next = C.replaceBlock(state.markdown, editingEvent.line, editingEvent.endLine, ''); $('event-dialog').close(); changed(next);
  });
  $('todo-form').addEventListener('submit', event => { event.preventDefault(); if (state.loading) return; try { changed(C.addTodo(state.markdown, $('todo-input').value)); $('todo-input').value = ''; } catch (e) { error(e.message); } });
  $('open-markdown').addEventListener('click', () => { $('markdown-input').value = state.markdown; $('markdown-dialog').showModal(); });
  $('apply-markdown').addEventListener('click', () => { const value = $('markdown-input').value; $('markdown-dialog').close(); changed(value); });
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('export-day').addEventListener('click', () => exportDay()); $('export-all').addEventListener('click', exportAll);
  $('import-note').addEventListener('click', () => $('import-file').click()); $('import-file').addEventListener('change', importFile);
  $('download-conflict').addEventListener('click', () => exportDay('-local-copy'));
  $('load-conflict').addEventListener('click', () => {
    if (!state.conflict || !confirm('최신 기록을 불러오면 지금 수정한 내용이 바뀝니다. 필요한 내용은 먼저 내려받아 주세요. 계속할까요?')) return;
    const note = state.conflict; state.markdown = note.markdown; state.version = note.version;
    state.conflict = null; state.dirty = false; $('conflict-panel').hidden = true; renderDay(); status('최신 기록 불러옴');
  });
  addEventListener('beforeunload', event => { if (state.dirty || document.querySelector('dialog[open]')) { event.preventDefault(); event.returnValue = ''; } });
  if (!hosted) {
    $('password').required = false; $('password').disabled = true; $('password').placeholder = '미리보기에서는 사용하지 않습니다';
    $('login-button').textContent = '미리보기'; $('preview-info').hidden = false;
    document.querySelector('.login-copy').textContent = '현재는 예시 기록만 볼 수 있습니다.';
  } else {
    const token = tokenStorage();
    if (token) unlock(token).catch(() => showLocked('비밀번호로 다시 로그인해 주세요.'));
  }
})();
