// GEDCOM 5.5.1: экспорт и импорт (F07, F08). Только стандартные теги плюс _PRIV (уровень конфиденциальности).
import * as D from './data.js';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ---------- даты ----------
function gedSingle(text) {
  const s = D.parseSingle(text); if (!s) return null;
  return [s.d, s.m ? MON[s.m - 1] : null, s.y].filter(Boolean).join(' ');
}
export function toGedDate(text) {
  const t = (text ?? '').trim(); if (!t) return '';
  let m;
  if ((m = t.match(/^(?:около|ок\.|~)\s*(.+)$/i))) return gedSingle(m[1]) ? 'ABT ' + gedSingle(m[1]) : '';
  if ((m = t.match(/^до\s+(.+)$/i))) return gedSingle(m[1]) ? 'BEF ' + gedSingle(m[1]) : '';
  if ((m = t.match(/^после\s+(.+)$/i))) return gedSingle(m[1]) ? 'AFT ' + gedSingle(m[1]) : '';
  if ((m = t.match(/^между\s+(.+?)\s+и\s+(.+)$/i))) return gedSingle(m[1]) && gedSingle(m[2]) ? `BET ${gedSingle(m[1])} AND ${gedSingle(m[2])}` : '';
  if ((m = t.match(/^с\s+(.+?)\s+по\s+(.+)$/i))) return gedSingle(m[1]) && gedSingle(m[2]) ? `FROM ${gedSingle(m[1])} TO ${gedSingle(m[2])}` : '';
  return gedSingle(t) ?? '';
}
const fromGedSingle = (s) => {
  const m = s.trim().toUpperCase().match(/^(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{4})$/);
  if (!m) return null;
  const mon = m[2] ? MON.indexOf(m[2]) + 1 : 0; if (m[2] && !mon) return null;
  if (m[1] && !mon) return null;
  return [m[1] && String(m[1]).padStart(2, '0'), mon && String(mon).padStart(2, '0'), m[3]].filter(Boolean).join('.');
};
export function fromGedDate(value) {   // → {text, julian} | null
  let v = (value ?? '').trim(); if (!v) return { text: '', julian: false };
  let julian = false;
  v = v.replace(/@#D([A-Z ]+)@\s*/g, (_, cal) => { if (/JULIAN/.test(cal)) julian = true; return ''; });
  const U = v.toUpperCase(); let m, text = null;
  if ((m = U.match(/^(?:ABT|ABOUT|EST|CAL|CIR|CA\.?)\s+(.+)$/))) { const x = fromGedSingle(m[1]); text = x && 'около ' + x; }
  else if ((m = U.match(/^BEF(?:ORE)?\s+(.+)$/)) || (m = U.match(/^TO\s+(.+)$/))) { const x = fromGedSingle(m[1]); text = x && 'до ' + x; }
  else if ((m = U.match(/^AFT(?:ER)?\s+(.+)$/))) { const x = fromGedSingle(m[1]); text = x && 'после ' + x; }
  else if ((m = U.match(/^BET(?:WEEN)?\s+(.+?)\s+AND\s+(.+)$/))) { const a = fromGedSingle(m[1]), b = fromGedSingle(m[2]); text = a && b && `между ${a} и ${b}`; }
  else if ((m = U.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/))) { const a = fromGedSingle(m[1]), b = fromGedSingle(m[2]); text = a && b && `с ${a} по ${b}`; }
  else if ((m = U.match(/^FROM\s+(.+)$/))) { const x = fromGedSingle(m[1]); text = x && 'после ' + x; }
  else text = fromGedSingle(U);
  if (!text) return null;
  return D.parseDate(text).error ? null : { text, julian };
}

// ---------- экспорт ----------
function emit(lines, level, tag, value) {
  const v = value === undefined || value === null || value === '' ? '' : String(value);
  const parts = v.split(/\r\n|\r|\n/);
  const first = parts[0];
  const chunks = (str) => { const out = []; for (let i = 0; i < str.length; i += 200) out.push(str.slice(i, i + 200)); return out.length ? out : ['']; };
  const c0 = chunks(first);
  lines.push(`${level} ${tag}${c0[0] ? ' ' + c0[0] : ''}`);
  for (const c of c0.slice(1)) lines.push(`${level + 1} CONC ${c}`);
  for (const p of parts.slice(1)) { const cc = chunks(p); lines.push(`${level + 1} CONT${cc[0] ? ' ' + cc[0] : ''}`); for (const c of cc.slice(1)) lines.push(`${level + 1} CONC ${c}`); }
}
export function exportGedcom({ maxPrivacy = 10, excludeLiving = false } = {}) {
  const all = D.listPersons();
  const inc = all.filter((p) => p.privacy_level <= maxPrivacy && !(excludeLiving && p.is_living));
  const ids = new Set(inc.map((p) => p.id));
  const xi = new Map(inc.map((p, i) => [p.id, `@I${i + 1}@`]));
  // семьи: пара родителей (из событий рождения) и браки
  const fams = new Map();
  const fam = (h, w) => { const k = `${h ?? ''}|${w ?? ''}`; if (!fams.has(k)) fams.set(k, { h, w, chil: [], marr: null, hasMarr: false }); return fams.get(k); };
  for (const c of inc) {
    const p = D.parentsOf(c.id); const f = ids.has(p.father) ? p.father : null, m = ids.has(p.mother) ? p.mother : null;
    if (f || m) fam(f, m).chil.push(c.id);
  }
  for (const p of inc) for (const s of D.spousesOf(p.id)) {
    if (!ids.has(s.id)) continue;
    const a = D.getPerson(p.id); if (a.sex !== 'M') continue;
    const F = fam(p.id, s.id); F.hasMarr = true; F.marr = s.dateText;
  }
  const famList = [...fams.values()]; famList.forEach((f, i) => (f.x = `@F${i + 1}@`));
  const fams_of = new Map(), famc_of = new Map();
  for (const f of famList) { for (const id of [f.h, f.w]) if (id) (fams_of.get(id) ?? fams_of.set(id, []).get(id)).push(f.x); for (const c of f.chil) (famc_of.get(c) ?? famc_of.set(c, []).get(c)).push(f.x); }

  const L = [];
  L.push('0 HEAD', '1 SOUR RODOSLOVNAYA', '2 NAME Rodoslovnaya (family tree)', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '1 LANG Russian');
  for (const p of inc) {
    L.push(`0 ${xi.get(p.id)} INDI`);
    const given = [p.given_name, p.patronymic].filter(Boolean).join(' ');
    L.push(`1 NAME ${given} /${p.surname}/`.replace(/\s+/g, ' ').replace('/ /', '//'));
    if (given) L.push(`2 GIVN ${given}`);
    if (p.surname) L.push(`2 SURN ${p.surname}`);
    if (p.maiden_name) { L.push(`1 NAME ${given} /${p.maiden_name}/`.replace(/\s+/g, ' ')); L.push('2 TYPE birth'); }
    if (p.sex !== 'U') L.push(`1 SEX ${p.sex}`);
    if (p.birth_text) { L.push('1 BIRT'); const d = toGedDate(p.birth_text); if (d) L.push(`2 DATE ${d}`); }
    if (!p.is_living) { const d = toGedDate(p.death_text); L.push(d ? '1 DEAT' : '1 DEAT Y'); if (d) L.push(`2 DATE ${d}`); }
    if (p.occupation) emit(L, 1, 'OCCU', p.occupation);
    if (p.comment) emit(L, 1, 'NOTE', p.comment);
    if (p.privacy_level) L.push(`1 _PRIV ${p.privacy_level}`);
    for (const x of famc_of.get(p.id) ?? []) L.push(`1 FAMC ${x}`);
    for (const x of fams_of.get(p.id) ?? []) L.push(`1 FAMS ${x}`);
  }
  for (const f of famList) {
    L.push(`0 ${f.x} FAM`);
    if (f.h) L.push(`1 HUSB ${xi.get(f.h)}`);
    if (f.w) L.push(`1 WIFE ${xi.get(f.w)}`);
    for (const c of f.chil) L.push(`1 CHIL ${xi.get(c)}`);
    if (f.hasMarr) { L.push('1 MARR'); const d = toGedDate(f.marr); if (d) L.push(`2 DATE ${d}`); }
  }
  L.push('0 TRLR');
  return L.join('\r\n') + '\r\n';
}

// ---------- импорт ----------
export function decodeGedcom(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'UTF-8' };
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16LE' };
  if (b[0] === 0xFE && b[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16BE' };
  const head = new TextDecoder('latin1').decode(b.subarray(0, 4000));
  const ch = (head.match(/^\s*1\s+CHAR\s+(\S+)/im)?.[1] ?? '').toUpperCase();
  if (/^(ANSI|WINDOWS-?1251|CP-?1251|CP1251|ASCII)$/.test(ch)) return { text: new TextDecoder('windows-1251').decode(b), encoding: 'windows-1251' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' }; }
  catch { return { text: new TextDecoder('windows-1251').decode(b), encoding: 'windows-1251 (определено по ошибке UTF-8)' }; }
}
export function parseGedcom(text) {
  const root = []; const stack = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([^\s]+)(?:\s(.*))?$/); if (!m) continue;
    const node = { level: +m[1], xref: m[2] ?? null, tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    if (node.tag === 'CONC' || node.tag === 'CONT') { const par = stack[node.level - 1]; if (par) par.value += (node.tag === 'CONT' ? '\n' : '') + node.value; continue; }
    stack.length = node.level; stack[node.level] = node;
    if (node.level === 0) root.push(node); else stack[node.level - 1]?.children.push(node);
  }
  return root;
}
const sub = (n, tag) => n.children.filter((c) => c.tag === tag);
const first = (n, tag) => sub(n, tag)[0];

export function importGedcom(text, { mode = 'add' } = {}) {
  const recs = parseGedcom(text);
  if (!recs.some((r) => r.tag === 'HEAD') && !recs.some((r) => r.tag === 'INDI')) throw new Error('Это не похоже на файл GEDCOM: нет заголовка и записей людей');
  const rep = { unmarried: 0, persons: 0, marriages: 0, parentLinks: 0, warnings: [], skipped: {}, julian: 0, version: first(first(recs.find((r) => r.tag === 'HEAD') ?? { children: [] }, 'GEDC') ?? { children: [] }, 'VERS')?.value ?? 'не указана' };
  const skip = (path) => { rep.skipped[path] = (rep.skipped[path] ?? 0) + 1; };
  const known = { INDI: ['NAME', 'SEX', 'BIRT', 'DEAT', 'OCCU', 'NOTE', '_PRIV', 'FAMC', 'FAMS'], FAM: ['HUSB', 'WIFE', 'CHIL', 'MARR'] };

  return D.tx(() => {
    if (mode === 'replace') D.resetStore(true);
    const map = new Map();                       // xref → id
    const dateOf = (node, ctx) => {
      const v = first(node, 'DATE')?.value; if (!v) return { text: '', note: '' };
      const r = fromGedDate(v); if (!r) { rep.warnings.push(`${ctx}: дата «${v}» не разобрана, сохранена в комментарии`); return { text: '', note: `Дата из GEDCOM: ${v}` }; }
      if (r.julian) rep.julian += 1;
      return { text: r.text, note: '' };
    };
    for (const n of recs.filter((r) => r.tag === 'INDI')) {
      const label = `Человек ${n.xref}`;
      for (const c of n.children) if (!known.INDI.includes(c.tag)) skip(`INDI.${c.tag}`);
      for (const tag of ['BIRT', 'DEAT']) for (const e of sub(n, tag)) for (const c of e.children) if (c.tag !== 'DATE') skip(`${tag}.${c.tag}`);
      const names = sub(n, 'NAME'); const prim = names.find((x) => !first(x, 'TYPE')) ?? names[0]; const maid = names.find((x) => x !== prim && /^(birth|maiden)$/i.test(first(x, 'TYPE')?.value ?? ''));
      const parseName = (nm) => {
        if (!nm) return { given: '', sur: '' };
        const m = nm.value.match(/^(.*?)\s*\/([^/]*)\/\s*(.*)$/);
        const given = first(nm, 'GIVN')?.value ?? (m ? m[1] : nm.value); const sur = first(nm, 'SURN')?.value ?? (m ? m[2] : '');
        return { given: given.trim(), sur: sur.trim() };
      };
      const pn = parseName(prim), mn = parseName(maid);
      const toks = pn.given.split(/\s+/).filter(Boolean);
      const note = []; const noteNodes = sub(n, 'NOTE').map((x) => x.value).filter(Boolean);
      const b = first(n, 'BIRT'), d = first(n, 'DEAT');
      const bd = b ? dateOf(b, label) : { text: '', note: '' }, dd = d ? dateOf(d, label) : { text: '', note: '' };
      if (bd.note) note.push(bd.note); if (dd.note) note.push(dd.note);
      const fields = {
        surname: pn.sur, given_name: toks[0] ?? '', patronymic: toks.slice(1).join(' '), maiden_name: mn.sur || undefined,
        sex: ['M', 'F'].includes(first(n, 'SEX')?.value?.trim().toUpperCase()) ? first(n, 'SEX').value.trim().toUpperCase() : 'U',
        is_living: !d, birth_text: bd.text, death_text: dd.text, occupation: first(n, 'OCCU')?.value ?? '',
        comment: [...noteNodes, ...note].join('\n'), privacy_level: Math.min(10, Math.max(0, parseInt(first(n, '_PRIV')?.value ?? '0', 10) || 0)),
      };
      if (!(fields.surname || fields.given_name)) fields.given_name = 'Без имени';
      let p;
      for (let attempt = 0; attempt < 3 && !p; attempt++) {
        try { p = D.createPerson(fields); }
        catch (e) {
          if (/раньше/.test(e.message)) { rep.warnings.push(`${label}: дата смерти раньше рождения, дата смерти перенесена в комментарий`); fields.comment = [fields.comment, `Дата смерти из GEDCOM: ${fields.death_text}`].filter(Boolean).join('\n'); fields.death_text = ''; }
          else if (/длинное/.test(e.message)) { rep.warnings.push(`${label}: слишком длинное значение обрезано`); for (const k of ['surname', 'given_name', 'patronymic', 'maiden_name', 'occupation']) if (typeof fields[k] === 'string') fields[k] = fields[k].slice(0, 100); fields.comment = fields.comment.slice(0, 20000); fields.occupation = (fields.occupation ?? '').slice(0, 200); }
          else { rep.warnings.push(`${label}: пропущен (${e.message})`); break; }
        }
      }
      if (p) { map.set(n.xref, p.id); rep.persons += 1; }
    }
    for (const f of recs.filter((r) => r.tag === 'FAM')) {
      for (const c of f.children) if (!known.FAM.includes(c.tag)) skip(`FAM.${c.tag}`);
      const ctx = `Семья ${f.xref}`;
      const h = map.get(first(f, 'HUSB')?.value), w = map.get(first(f, 'WIFE')?.value);
      const setSex = (id, sex) => { const p = D.getPerson(id); if (p.sex === 'U') D.updatePerson(id, { sex }); };
      try { if (h) setSex(h, 'M'); if (w) setSex(w, 'F'); } catch (e) { rep.warnings.push(`${ctx}: ${e.message}`); }
      const marr = first(f, 'MARR');
      if (h && w && !marr && sub(f, 'CHIL').length) rep.unmarried = (rep.unmarried ?? 0) + 1;     // пара с детьми без отметки о браке: брак не создаём
      if (h && w && (marr || !sub(f, 'CHIL').length)) {
        const md = marr ? dateOf(marr, ctx) : { text: '' };
        try { D.linkSpouse(h, w, md.text); rep.marriages += 1; } catch (e) { rep.warnings.push(`${ctx}: пара не создана (${e.message})`); }
      }
      for (const c of sub(f, 'CHIL')) {
        const cid = map.get(c.value); if (!cid) { rep.warnings.push(`${ctx}: ребёнок ${c.value} не найден`); continue; }
        for (const par of [h, w]) if (par) { try { if (D.linkParent(cid, par, { force: true }) === 'age') rep.warnings.push(`${ctx}: родитель моложе ребёнка — связь оставлена, проверьте даты`); rep.parentLinks += 1; } catch (e) { rep.warnings.push(`${ctx}: связь «родитель – ребёнок» не создана (${e.message})`); } }
      }
    }
    return rep;
  });
}
