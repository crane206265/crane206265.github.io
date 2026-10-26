(function (root) {
  'use strict';
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  const pad = n => String(n).padStart(2, '0');
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === value && +value.slice(0, 4) >= 1900 && +value.slice(0, 4) <= 2100;
  }
  function shiftDate(date, days) {
    if (!validDate(date)) throw new Error('올바른 날짜를 선택해 주세요.');
    const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function template(date) {
    return `Prev : [[${shiftDate(date, -1)}]]\nNext : [[${shiftDate(date, 1)}]]\n\n**\\[TODO List of Today\\]**\n`;
  }
  function minutes(value) {
    if (!/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  function parse(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    const events = [], todos = [];
    let todoSection = false;
    for (let i = 0; i < lines.length; i++) {
      if (/TODO\s+List\s+of\s+Today/i.test(lines[i])) { todoSection = true; continue; }
      if (/^#{1,6}\s/.test(lines[i])) todoSection = false;
      const event = lines[i].match(/^[-*]\s+\[([ xX])\]\s+(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})\s+(.+)$/);
      const endOfBlock = index => {
        let end = index + 1;
        while (end < lines.length && /^(?:\t| {2,})\S|^(?:\t| {2,})\s*[-*]/.test(lines[end])) end++;
        return end;
      };
      if (event && !todoSection) {
        const start = event[2].padStart(5, '0'), end = event[3].padStart(5, '0');
        if (minutes(start) === null || minutes(end) === null) continue;
        const endLine = endOfBlock(i);
        const notes = lines.slice(i + 1, endLine).map(l => l.replace(/^\s*[-*]?\s?/, '')).join('\n');
        events.push({ line: i, endLine, checked: event[1].toLowerCase() === 'x', start, end, title: event[4], notes });
      } else if (todoSection) {
        const todo = lines[i].match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.+)$/);
        if (todo) {
          const struck = /^~~[\s\S]+~~$/.test(todo[2]);
          const endLine = endOfBlock(i);
          todos.push({ line: i, endLine, checked: todo[1] ? todo[1].toLowerCase() === 'x' : struck,
            checkbox: todo[1] !== undefined, title: struck ? todo[2].slice(2, -2) : todo[2],
            notes: lines.slice(i + 1, endLine).map(l => l.replace(/^\s*[-*]?\s?/, '')).join('\n') });
        }
      }
    }
    const duration = events.reduce((sum, e) => {
      let d = minutes(e.end) - minutes(e.start); if (d < 0) d += 1440;
      return sum + d;
    }, 0);
    return { lines, events, todos, duration, completed: events.filter(e => e.checked).length };
  }
  function replaceBlock(markdown, start, end, text) {
    const lines = parse(markdown).lines;
    lines.splice(start, end - start, ...(text ? text.split('\n') : []));
    return lines.join('\n').replace(/\n*$/, '\n');
  }
  function layoutTimeline(events) {
    const slots = events.map(event => {
      const start = minutes(event.start);
      let end = minutes(event.end);
      if (end < start) end += 1440;
      return { event, start, end, displayEnd: Math.max(end, start + 30), column: 0, columns: 1 };
    }).sort((a, b) => a.start - b.start || a.end - b.end || a.event.line - b.event.line);
    let group = [], ends = [], groupEnd = -1;
    const finish = () => { for (const slot of group) slot.columns = ends.length; };
    for (const slot of slots) {
      if (slot.start >= groupEnd) { finish(); group = []; ends = []; groupEnd = -1; }
      let column = ends.findIndex(end => end <= slot.start);
      if (column < 0) column = ends.length;
      ends[column] = slot.displayEnd; slot.column = column;
      group.push(slot); groupEnd = Math.max(groupEnd, slot.displayEnd);
    }
    finish();
    return {
      start: slots.length ? Math.max(0, Math.floor(slots[0].start / 60) * 60 - 60) : 480,
      end: slots.length ? Math.min(2880, Math.ceil(Math.max(...slots.map(s => s.displayEnd)) / 60) * 60 + 60) : 1200,
      slots
    };
  }
  function toggleEvent(markdown, index) {
    const { lines } = parse(markdown);
    lines[index] = lines[index].replace(/\[([ xX])\]/, (_, c) => c.toLowerCase() === 'x' ? '[ ]' : '[x]');
    return lines.join('\n');
  }
  function toggleTodo(markdown, index) {
    const todo = parse(markdown).todos.find(t => t.line === index);
    if (!todo) return markdown;
    if (todo.checkbox) return toggleEvent(markdown, index);
    const { lines } = parse(markdown);
    lines[index] = '- ' + (todo.checked ? todo.title : `~~${todo.title}~~`);
    return lines.join('\n');
  }
  function upsertEvent(markdown, event, existing) {
    if (minutes(event.start) === null || minutes(event.end) === null || !event.title.trim() || /[\r\n]/.test(event.title)) throw new Error('시간과 일정 제목을 확인해 주세요.');
    const noteLines = String(event.notes || '').split('\n').filter(Boolean).map(l => '\t- ' + l);
    const block = [`- [${event.checked ? 'x' : ' '}] ${event.start} - ${event.end} ${event.title.trim()}`, ...noteLines].join('\n');
    if (existing) return replaceBlock(markdown, existing.line, existing.endLine, block);
    const { lines } = parse(markdown);
    const todoLine = lines.findIndex(l => /TODO\s+List\s+of\s+Today/i.test(l));
    lines.splice(todoLine < 0 ? lines.length : todoLine, 0, block, '');
    return lines.join('\n').replace(/\n*$/, '\n');
  }
  function addTodo(markdown, title) {
    title = title.trim();
    if (!title || /[\r\n]/.test(title)) throw new Error('할 일을 한 줄로 입력해 주세요.');
    let result = markdown.replace(/\n*$/, '\n');
    if (!/TODO\s+List\s+of\s+Today/i.test(result)) result += '\n**\\[TODO List of Today\\]**\n';
    // Insert into the TODO section, before a following top-level heading if present.
    const lines = result.split('\n'), marker = lines.findIndex(l => /TODO\s+List\s+of\s+Today/i.test(l));
    let at = marker + 1;
    while (at < lines.length && !/^#{1,6}\s/.test(lines[at])) at++;
    lines.splice(at, 0, '- ' + title);
    return lines.join('\n').replace(/\n*$/, '\n');
  }
  function week(date) {
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    const monday = shiftDate(date, -((weekday + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  }
  function exportPath(date) {
    if (!validDate(date)) throw new Error('Invalid date');
    const [y, m, d] = date.split('-').map(Number);
    const first = (new Date(`${y}-${pad(m)}-01T12:00:00Z`).getUTCDay() + 6) % 7;
    const w = Math.floor((d + first - 1) / 7) + 1;
    return `${y}/${months[m - 1]} ${y}/${months[m - 1]} Week ${w}/${date}.md`;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipNotes(notes) {
    const encoder = new TextEncoder(), parts = [], directory = []; let offset = 0;
    for (const note of notes) {
      const name = encoder.encode(exportPath(note.date)), data = encoder.encode(note.markdown), crc = crc32(data);
      const local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(12, 0x21, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true); local.set(name, 30);
      const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
      parts.push(local, data); directory.push(central); offset += local.length + data.length;
    }
    const size = directory.reduce((n, x) => n + x.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, notes.length, true); e.setUint16(10, notes.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  const api = { validDate, shiftDate, today, template, minutes, parse, layoutTimeline, replaceBlock, toggleEvent, toggleTodo, upsertEvent, addTodo, week, exportPath, zipNotes, crc32 };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlannerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
