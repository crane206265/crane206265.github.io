const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const note = 'Prev : [[2026-10-25]]\nNext : [[2026-10-27]]\n\n# 메모 제목\n\n- [ ] 09:00 - 10:00 **자료 정리**\n\t- [[연구 노트]]\n\t- 보존할 메모\n\n#### 다른 구역\n- [x] 23:30 - 00:30 휴식\n\n**\\[TODO List of TODAY\\]**\n- 정리하기\n\t- 세부 내용\n- ~~읽기~~\n';

test('Obsidian-style events, nested notes, TODO and cross-midnight duration', () => {
  const parsed = C.parse(note);
  assert.equal(parsed.events.length, 2); assert.equal(parsed.duration, 120);
  assert.equal(parsed.events[0].notes, '[[연구 노트]]\n보존할 메모');
  assert.equal(parsed.todos.length, 2); assert.equal(parsed.todos[1].checked, true);
});
test('Toggling preserves unrelated Markdown and child notes byte-for-byte', () => {
  const event = C.parse(note).events[0];
  assert.equal(C.toggleEvent(C.toggleEvent(note, event.line), event.line), note);
  const todo = C.parse(note).todos[0];
  assert.equal(C.toggleTodo(C.toggleTodo(note, todo.line), todo.line), note);
});
test('Editing and deleting one event retains other headings and TODO content', () => {
  const old = C.parse(note).events[0];
  const edited = C.upsertEvent(note, { start: '10:00', end: '11:00', title: '변경한 일정', notes: '메모', checked: false }, old);
  assert.ok(edited.includes('#### 다른 구역')); assert.equal(C.parse(edited).todos.length, 2);
  const removed = C.replaceBlock(note, old.line, old.endLine, '');
  assert.equal(C.parse(removed).events.length, 1); assert.equal(C.parse(removed).todos.length, 2);
});
test('New events go before TODO; new TODOs remain before a following note heading', () => {
  const added = C.upsertEvent(note, { start: '12:00', end: '13:00', title: '새 일정' });
  assert.equal(C.parse(added).events.length, 3);
  const todo = C.addTodo(note + '\n# 자유 기록\n원문 보존\n', '새 할 일');
  assert.equal(C.parse(todo).todos.length, 3); assert.ok(todo.indexOf('- 새 할 일') < todo.indexOf('# 자유 기록'));
});
test('Invalid dates and malformed event times are rejected', () => {
  assert.equal(C.validDate('2026-02-29'), false); assert.equal(C.validDate('2028-02-29'), true);
  assert.throws(() => C.upsertEvent(note, { start: '24:00', end: '25:00', title: 'wrong' }));
  assert.throws(() => C.upsertEvent(note, { start: '09:00', end: '10:00', title: 'one\ntwo' }));
  assert.deepEqual(C.week('2026-10-26'), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
});

test('Timeline separates overlaps, reuses lanes at boundaries and handles midnight', () => {
  const events = C.parse('- [ ] 09:00 - 11:00 A\n- [ ] 10:00 - 12:00 B\n- [ ] 12:00 - 13:00 C\n- [ ] 23:30 - 00:30 D\n').events;
  const layout = C.layoutTimeline(events);
  assert.equal(layout.start, 480);
  assert.equal(layout.slots[0].columns, 2);
  assert.notEqual(layout.slots[0].column, layout.slots[1].column);
  assert.equal(layout.slots[2].columns, 1);
  assert.equal(layout.slots[3].end, 1470);
  assert.ok(layout.end > layout.slots[3].end);
  const short = C.layoutTimeline(C.parse('- [ ] 09:00 - 09:05 A\n- [ ] 09:10 - 09:15 B\n').events);
  assert.notEqual(short.slots[0].column, short.slots[1].column);
  assert.equal(C.layoutTimeline([]).slots.length, 0);
});
test('ZIP export uses the original calendar-week hierarchy, UTF-8, and CRC32', async () => {
  assert.equal(C.exportPath('2026-10-26'), '2026/Oct. 2026/Oct. Week 5/2026-10-26.md');
  assert.equal(C.exportPath('2026-01-05'), '2026/Jan. 2026/Jan. Week 2/2026-01-05.md');
  assert.equal(C.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = new Uint8Array(await C.zipNotes([{ date: '2026-10-26', markdown: note }]).arrayBuffer());
  const view = new DataView(zip.buffer); assert.equal(view.getUint32(0, true), 0x04034b50);
  const nameLength = view.getUint16(26, true), dataLength = view.getUint32(18, true);
  assert.equal(new TextDecoder().decode(zip.slice(30 + nameLength, 30 + nameLength + dataLength)), note);
  assert.equal(C.crc32(zip.slice(30 + nameLength, 30 + nameLength + dataLength)), view.getUint32(14, true));
});
