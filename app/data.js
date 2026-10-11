// Слой данных первого сценария (ФЕЙК: localStorage или память).
// Сигнатуры функций совпадают с планом API из replica/architecture.md, чтобы замена на Supabase не меняла экраны.
// Модель: персоны, события (рождение/брак/смерть) и участники с ролями; родство вычисляется из событий.

const KEY = 'rodoslovnaya.demo.v1';
const mem = {};
let db = null;
let lastRaw = null;       // что мы сами прочитали или записали в последний раз
let memOnly = false;      // хранилище браузера недоступно: работаем только в памяти
const newId = () => globalThis.crypto.randomUUID();

function readRaw() {
  if (memOnly) return undefined;
  try { return globalThis.localStorage ? globalThis.localStorage.getItem(KEY) : (mem[KEY] ?? null); }
  catch { memOnly = true; return undefined; }
}
function writeRaw(v) {
  if (memOnly) return;
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(KEY, v); else mem[KEY] = v; lastRaw = v; }
  catch { memOnly = true; }
}
export const storageMode = () => (memOnly ? 'memory' : 'browser');

export const REL_KINDS = {
  father: { label: 'Отец', sex: 'M' },
  mother: { label: 'Мать', sex: 'F' },
  brother: { label: 'Брат', sex: 'M' },
  sister: { label: 'Сестра', sex: 'F' },
  husband: { label: 'Муж', sex: 'M' },
  wife: { label: 'Жена', sex: 'F' },
  son: { label: 'Сын', sex: 'M' },
  daughter: { label: 'Дочь', sex: 'F' },
};

function save() { writeRaw(JSON.stringify(db)); }
export function resetStore(empty = false) {
  db = { persons: {}, events: {}, participants: [] };
  lastRaw = readRaw() ?? null;          // чтобы вложенные вызовы ensure() не перечитывали пустое хранилище
  if (!empty) seed();
  save();
}
function ensure() {
  // Каждый раз сверяемся с хранилищем: другая вкладка могла изменить данные (BUG-001).
  const raw = readRaw();
  if (raw === undefined) { if (!db) resetStore(); return; }       // только память
  if (db && raw === lastRaw) return;
  if (raw) { try { db = JSON.parse(raw); lastRaw = raw; return; } catch { /* повреждено: пересоздаём */ } }
  resetStore();
}

// ---------- даты ----------
const pad = (n) => String(n).padStart(2, '0');
function single(s) {
  const m = s.trim().match(/^(?:(\d{1,2})\.)?(?:(\d{1,2})\.)?(\d{4})$/);
  if (!m) return null;
  let d = m[1], mo = m[2];
  if (d && !mo) { mo = d; d = undefined; }          // «03.1950» → месяц.год
  const y = +m[3], mon = mo ? +mo : null, day = d ? +d : null;
  if (y < 1000 || y > 2200) return null;
  if (mon !== null && (mon < 1 || mon > 12)) return null;
  if (day !== null) {
    const t = new Date(Date.UTC(y, mon - 1, day));
    if (t.getUTCMonth() !== mon - 1 || t.getUTCDate() !== day) return null;
  }
  return `${y}-${pad(mon ?? 1)}-${pad(day ?? 1)}`;
}
export function parseDate(text) {
  const t = (text ?? '').trim();
  const empty = { kind: 'none', text: '', from: null, to: null, sort: null, calendar: 'gregorian' };
  if (!t) return empty;
  const bad = { error: 'Не разобрал дату. Примеры: 26.05.1799, 05.1799, 1799, около 1717, между 1811 и 1817' };
  let m;
  if ((m = t.match(/^(?:около|ок\.|~)\s*(.+)$/i))) { const d = single(m[1]); return d ? { kind: 'about', text: t, from: d, to: null, sort: d, calendar: 'gregorian' } : bad; }
  if ((m = t.match(/^до\s+(.+)$/i))) { const d = single(m[1]); return d ? { kind: 'before', text: t, from: null, to: d, sort: d, calendar: 'gregorian' } : bad; }
  if ((m = t.match(/^после\s+(.+)$/i))) { const d = single(m[1]); return d ? { kind: 'after', text: t, from: d, to: null, sort: d, calendar: 'gregorian' } : bad; }
  if ((m = t.match(/^между\s+(.+?)\s+и\s+(.+)$/i))) {
    const a = single(m[1]), b = single(m[2]);
    if (!a || !b) return bad; if (b < a) return { error: 'Вторая дата раньше первой' };
    return { kind: 'between', text: t, from: a, to: b, sort: a, calendar: 'gregorian' };
  }
  if ((m = t.match(/^с\s+(.+?)\s+по\s+(.+)$/i))) {
    const a = single(m[1]), b = single(m[2]);
    if (!a || !b) return bad; if (b < a) return { error: 'Вторая дата раньше первой' };
    return { kind: 'from_to', text: t, from: a, to: b, sort: a, calendar: 'gregorian' };
  }
  const d = single(t);
  return d ? { kind: 'exact', text: t, from: d, to: d, sort: d, calendar: 'gregorian' } : bad;
}

// ---------- события ----------
function mkEvent(type, dateText) {
  const d = parseDate(dateText);
  if (d.error) throw new Error(d.error);
  const e = { id: newId(), type, date_text: d.text, date_kind: d.kind, date_from: d.from, date_to: d.to, date_sort: d.sort, version: 1 };
  db.events[e.id] = e;
  return e;
}
const part = (event_id, person_id, role) => {
  if (db.participants.some((p) => p.event_id === event_id && p.person_id === person_id)) throw new Error('Человек уже участвует в этом событии');
  if (['child', 'father', 'mother', 'husband', 'wife'].includes(role) && db.participants.some((p) => p.event_id === event_id && p.role === role)) throw new Error('Эта роль в событии уже занята');
  db.participants.push({ event_id, person_id, role });
};
const evOf = (personId, role, type) => {
  const p = db.participants.find((x) => x.person_id === personId && x.role === role && db.events[x.event_id].type === type);
  return p ? db.events[p.event_id] : null;
};
const birthEvent = (id) => evOf(id, 'child', 'birth');
const deathEvent = (id) => evOf(id, 'subject', 'death');
const roleIn = (eventId, role) => db.participants.find((p) => p.event_id === eventId && p.role === role)?.person_id ?? null;

function setLife(personId, type, role, dateText) {
  let e = type === 'birth' ? birthEvent(personId) : deathEvent(personId);
  const t = (dateText ?? '').trim();
  if (!e && !t) return;
  if (!e) { e = mkEvent(type, t); part(e.id, personId, role); return; }
  const d = parseDate(t);
  if (d.error) throw new Error(d.error);
  Object.assign(e, { date_text: d.text, date_kind: d.kind, date_from: d.from, date_to: d.to, date_sort: d.sort, version: e.version + 1 });
}

// ---------- персоны ----------
const decorate = (p) => {
  if (!p) return null;
  const b = birthEvent(p.id), d = deathEvent(p.id);
  return { ...p, birth_text: b?.date_text ?? '', birth_sort: b?.date_sort ?? null, death_text: d?.date_text ?? '', death_sort: d?.date_sort ?? null };
};
export const displayName = (p) => [p.surname, p.given_name, p.patronymic].filter(Boolean).join(' ') || 'Без имени';
export function lifeText(p) {
  const y = (s) => (s ? s.slice(0, 4) : '');
  const b = y(p.birth_sort), d = y(p.death_sort);
  if (!b && !d) return '';
  return p.is_living ? `${b}` : `${b || '?'} – ${d || '?'}`;
}
const LIMITS = { surname: 100, given_name: 100, patronymic: 100, maiden_name: 100, occupation: 200, comment: 20000, birth_text: 60, death_text: 60 };
const FIELD_NAMES = { surname: 'Фамилия', given_name: 'Имя', patronymic: 'Отчество', maiden_name: 'Девичья фамилия', occupation: 'Занятие', comment: 'Комментарий', birth_text: 'Дата рождения', death_text: 'Дата смерти' };
function validate(f, partial = false) {
  if (!partial && !((f.surname ?? '').trim() || (f.given_name ?? '').trim())) throw new Error('Укажите хотя бы фамилию или имя');
  if (partial && ('surname' in f || 'given_name' in f) && f.surname !== undefined && f.given_name !== undefined && !f.surname.trim() && !f.given_name.trim()) throw new Error('Укажите хотя бы фамилию или имя');
  for (const [k, max] of Object.entries(LIMITS)) if (typeof f[k] === 'string' && f[k].length > max) throw new Error(`Слишком длинное значение в поле «${FIELD_NAMES[k]}» (не больше ${max} знаков)`);
  if (f.sex !== undefined && !['M', 'F', 'U'].includes(f.sex)) throw new Error('Пол: M, F или U');
  if (f.privacy_level !== undefined && !(f.privacy_level >= 0 && f.privacy_level <= 10)) throw new Error('Конфиденциальность от 0 до 10');
  for (const k of ['birth_text', 'death_text']) if (f[k] !== undefined) { const d = parseDate(f[k]); if (d.error) throw new Error(d.error); }
}
function checkOrder(birthText, deathText, living) {
  if (living) return;
  const b = parseDate(birthText ?? '').sort, d = parseDate(deathText ?? '').sort;
  if (b && d && d < b) throw new Error('Дата смерти раньше даты рождения');
}
const SEX_NEEDED = { father: 'M', husband: 'M', mother: 'F', wife: 'F' };
function checkSexChange(id, sex) {
  for (const p of db.participants) {
    if (p.person_id !== id) continue;
    const need = SEX_NEEDED[p.role];
    if (need && need !== sex) throw new Error(`Нельзя изменить пол: человек указан как ${{ father: 'отец', mother: 'мать', husband: 'муж', wife: 'жена' }[p.role]} в событиях. Сначала уберите эту связь.`);
  }
}
export function createPerson(f) {
  ensure(); validate(f); checkOrder(f.birth_text, f.death_text, !!f.is_living);
  const p = {
    id: newId(), surname: f.surname?.trim() ?? '', given_name: f.given_name?.trim() ?? '', patronymic: f.patronymic?.trim() ?? '',
    maiden_name: f.maiden_name?.trim() || null, sex: f.sex ?? 'U', is_living: !!f.is_living, occupation: f.occupation?.trim() ?? '',
    comment: f.comment?.trim() ?? '', privacy_level: f.privacy_level ?? 0, version: 1,
  };
  db.persons[p.id] = p;
  setLife(p.id, 'birth', 'child', f.birth_text);
  if (!p.is_living) setLife(p.id, 'death', 'subject', f.death_text);
  save();
  return decorate(p);
}
export function updatePerson(id, patch, version) {
  ensure();
  const p = db.persons[id]; if (!p) throw new Error('Персона не найдена');
  if (version !== undefined && version !== p.version) { const e = new Error('Запись изменили в другом окне. Обновите страницу.'); e.code = 'CONFLICT'; throw e; }
  validate(patch, true);
  const living = patch.is_living ?? p.is_living;
  checkOrder(patch.birth_text ?? birthEvent(id)?.date_text, patch.death_text ?? deathEvent(id)?.date_text, living);
  if (patch.sex !== undefined && patch.sex !== p.sex) checkSexChange(id, patch.sex);
  for (const k of ['surname', 'given_name', 'patronymic', 'maiden_name', 'sex', 'is_living', 'occupation', 'comment', 'privacy_level']) if (patch[k] !== undefined) p[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  if (patch.birth_text !== undefined) setLife(id, 'birth', 'child', patch.birth_text);
  if (patch.death_text !== undefined || patch.is_living) setLife(id, 'death', 'subject', p.is_living ? '' : (patch.death_text ?? deathEvent(id)?.date_text ?? ''));
  p.version += 1; save();
  return decorate(p);
}
export function deletePerson(id) {
  ensure(); if (!db.persons[id]) return;
  delete db.persons[id];
  db.participants = db.participants.filter((x) => x.person_id !== id);
  for (const e of Object.keys(db.events)) if (!db.participants.some((x) => x.event_id === e)) delete db.events[e];
  save();
}
export const getPerson = (id) => { ensure(); return decorate(db.persons[id]); };
export function listPersons({ q = '', onlyLiving = false } = {}) {
  ensure();
  const needle = q.trim().toLowerCase();
  return Object.values(db.persons).map(decorate)
    .filter((p) => (!needle || [p.surname, p.given_name, p.patronymic, p.maiden_name ?? '', p.occupation].join(' ').toLowerCase().includes(needle)) && (!onlyLiving || p.is_living))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru'));
}

// ---------- родство из событий ----------
export function parentsOf(id) {
  ensure(); const e = birthEvent(id);
  return e ? { father: roleIn(e.id, 'father'), mother: roleIn(e.id, 'mother'), eventId: e.id } : { father: null, mother: null, eventId: null };
}
export function childrenOf(id) {
  ensure();
  return db.participants.filter((p) => (p.role === 'father' || p.role === 'mother') && p.person_id === id && db.events[p.event_id].type === 'birth')
    .map((p) => roleIn(p.event_id, 'child')).filter(Boolean)
    .sort((a, b) => (birthEvent(a)?.date_sort ?? '9').localeCompare(birthEvent(b)?.date_sort ?? '9'));
}
export function spousesOf(id) {
  ensure(); const out = [];
  for (const p of db.participants) {
    if ((p.role !== 'husband' && p.role !== 'wife') || p.person_id !== id) continue;
    const e = db.events[p.event_id]; if (e.type !== 'marriage') continue;
    const other = roleIn(e.id, p.role === 'husband' ? 'wife' : 'husband');
    if (other) out.push({ id: other, eventId: e.id, dateText: e.date_text });
  }
  return out;
}
export function siblingsOf(id) {
  ensure(); const { father, mother } = parentsOf(id); const s = new Set();
  for (const par of [father, mother]) if (par) childrenOf(par).forEach((c) => c !== id && s.add(c));
  return [...s];
}

// ---------- добавление родственника (правила из руководства Genery, recon [6]) ----------
export function canAddRelative(id, kind) {
  ensure(); const p = db.persons[id]; if (!p) return { ok: false, reason: 'Персона не найдена' };
  const par = parentsOf(id);
  switch (kind) {
    case 'father': return par.father ? { ok: false, reason: 'Отец уже указан' } : { ok: true };
    case 'mother': return par.mother ? { ok: false, reason: 'Мать уже указана' } : { ok: true };
    case 'brother': case 'sister': return par.father || par.mother ? { ok: true } : { ok: false, reason: 'Сначала добавьте отца или мать' };
    case 'wife': return p.sex === 'M' ? { ok: true } : { ok: false, reason: 'Жену можно добавить только мужчине' };
    case 'husband': return p.sex === 'F' ? { ok: true } : { ok: false, reason: 'Мужа можно добавить только женщине' };
    case 'son': case 'daughter': return p.sex === 'U' ? { ok: false, reason: 'Укажите пол, чтобы добавить ребёнка' } : { ok: true };
    default: return { ok: false, reason: 'Неизвестный вид родства' };
  }
}
export function addRelative(id, kind, fields, opts = {}) {
  ensure();
  const chk = canAddRelative(id, kind); if (!chk.ok) throw new Error(chk.reason);
  const base = db.persons[id];
  const sex = REL_KINDS[kind].sex;
  const snapshot = JSON.stringify(db);
  try {
    const person = createPerson({ ...fields, sex });
    const nid = person.id;
    if (kind === 'father' || kind === 'mother') {
      let e = birthEvent(id);
      if (!e) { e = mkEvent('birth', ''); part(e.id, id, 'child'); }
      part(e.id, nid, kind);
    } else if (kind === 'brother' || kind === 'sister') {
      const pr = parentsOf(id);
      let e = birthEvent(nid); if (!e) { e = mkEvent('birth', ''); part(e.id, nid, 'child'); }
      if (pr.father) part(e.id, pr.father, 'father');
      if (pr.mother) part(e.id, pr.mother, 'mother');
    } else if (kind === 'wife' || kind === 'husband') {
      const e = mkEvent('marriage', fields.marriage_text ?? '');
      part(e.id, kind === 'wife' ? id : nid, 'husband'); part(e.id, kind === 'wife' ? nid : id, 'wife');
    } else {
      let e = birthEvent(nid); if (!e) { e = mkEvent('birth', ''); part(e.id, nid, 'child'); }
      part(e.id, id, base.sex === 'M' ? 'father' : 'mother');
      if (opts.otherParentId) {
        const o = db.persons[opts.otherParentId]; if (!o || o.sex === base.sex || o.sex === 'U') throw new Error('Второй родитель должен быть другого пола');
        part(e.id, o.id, o.sex === 'M' ? 'father' : 'mother');
      }
    }
    save();
    return decorate(db.persons[nid]);
  } catch (err) { db = JSON.parse(snapshot); save(); throw err; }   // откат при ошибке
}
export function exportJson() { ensure(); return JSON.stringify(db, null, 2); }

// ---------- тестовые (вымышленные) данные ----------
function seed() {
  const mk = (surname, given_name, patronymic, sex, birth, death, extra = {}) =>
    createPerson({ surname, given_name, patronymic, sex, birth_text: birth, death_text: death, is_living: !death, ...extra });
  const marry = (h, w, date) => { const e = mkEvent('marriage', date); part(e.id, h, 'husband'); part(e.id, w, 'wife'); };
  const child = (c, f, m) => { let e = birthEvent(c); if (!e) { e = mkEvent('birth', ''); part(e.id, c, 'child'); } if (f) part(e.id, f, 'father'); if (m) part(e.id, m, 'mother'); };
  const petr = mk('Иванов', 'Пётр', 'Иванович', 'M', '12.03.1921', '04.11.1990', { occupation: 'Столяр' }).id;
  const anna = mk('Иванова', 'Анна', 'Сергеевна', 'F', '1925', '17.02.2004', { maiden_name: 'Орлова' }).id;
  marry(petr, anna, '1946');
  const nik = mk('Иванов', 'Николай', 'Петрович', 'M', '08.06.1947', '', { occupation: 'Инженер' }).id;
  const mar = mk('Кузнецова', 'Мария', 'Петровна', 'F', '21.09.1950', '', { maiden_name: 'Иванова' }).id;
  child(nik, petr, anna); child(mar, petr, anna);
  const elena = mk('Иванова', 'Елена', 'Андреевна', 'F', '1949', '', { maiden_name: 'Соколова' }).id;
  marry(nik, elena, '14.08.1972');
  const alex = mk('Иванов', 'Алексей', 'Николаевич', 'M', '03.02.1975', '', { occupation: 'Учитель' }).id;
  const olga = mk('Смирнова', 'Ольга', 'Николаевна', 'F', '1979', '', { maiden_name: 'Иванова' }).id;
  child(alex, nik, elena); child(olga, nik, elena);
  const viktor = mk('Кузнецов', 'Виктор', 'Павлович', 'M', '1948', '').id;
  marry(viktor, mar, '1974');
  const dmitry = mk('Кузнецов', 'Дмитрий', 'Викторович', 'M', '1978', '').id;
  child(dmitry, viktor, mar);
  const irina = mk('Иванова', 'Ирина', 'Олеговна', 'F', '1977', '', { maiden_name: 'Белова' }).id;
  marry(alex, irina, '2001');
  const maxim = mk('Иванов', 'Максим', 'Алексеевич', 'M', '2004', '', { privacy_level: 8 }).id;
  child(maxim, alex, irina);
}
