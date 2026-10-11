// Названия степеней родства по-русски — относительно выбранной персоны (root).
import { getPerson, parentsOf, childrenOf, spousesOf } from './data.js';

function ancestors(id) {            // id → расстояние (поколения вверх), включая себя = 0
  const m = new Map([[id, 0]]); let layer = [id]; let d = 0;
  while (layer.length && d < 12) {
    d += 1; const next = [];
    for (const x of layer) { const p = parentsOf(x); for (const y of [p.father, p.mother]) if (y && !m.has(y)) { m.set(y, d); next.push(y); } }
    layer = next;
  }
  return m;
}
const pre = (n) => 'пра'.repeat(Math.max(0, n));
const g = (sex, m, f, u) => (sex === 'M' ? m : sex === 'F' ? f : u);

function blood(rootId, targetId) {            // {up, down} или null
  const A = ancestors(rootId), B = ancestors(targetId);
  let best = null;
  for (const [id, a] of A) if (B.has(id)) { const b = B.get(id); if (!best || a + b < best.up + best.down) best = { up: a, down: b }; }
  return best;
}
function bloodName(up, down, sex) {
  if (up === 0 && down === 0) return 'это он(а) сам(а)';
  if (down === 0) {                            
    return up === 1 ? g(sex, 'отец', 'мать', 'родитель') : `${pre(up - 2)}${g(sex, 'дед', 'бабушка', 'дед/бабушка')}`;
  }
  if (up === 0) return down === 1 ? g(sex, 'сын', 'дочь', 'ребёнок') : `${pre(down - 2)}${g(sex, 'внук', 'внучка', 'внук/внучка')}`;
  if (up === 1 && down === 1) return g(sex, 'брат', 'сестра', 'брат/сестра');
  if (up === 1 && down === 2) return g(sex, 'племянник', 'племянница', 'племянник/племянница');
  if (up === 2 && down === 1) return g(sex, 'дядя', 'тётя', 'дядя/тётя');
  if (up === 2 && down === 2) return g(sex, 'двоюродный брат', 'двоюродная сестра', 'двоюродный брат/сестра');
  return 'родственник';
}
// В blood(): up — поколений от root до общего предка, down — от общего предка до target.

export function relationName(rootId, targetId) {
  if (rootId === targetId) return 'это он(а) сам(а)';
  const root = getPerson(rootId), t = getPerson(targetId);
  if (!root || !t) return '';
  const b = blood(rootId, targetId);
  if (b) {
    // b.up: root → общий предок; b.down: общий предок → target
    if (b.up === 0) return bloodName(0, b.down, t.sex);          // target — потомок root
    if (b.down === 0) return bloodName(b.up, 0, t.sex);          // target — предок root
    return bloodName(b.up, b.down, t.sex);
  }
  if (spousesOf(rootId).some((s) => s.id === targetId)) return g(t.sex, 'муж', 'жена', 'супруг(а)');
  // родитель супруга(и)
  for (const s of spousesOf(rootId)) {
    const sb = blood(s.id, targetId);
    if (sb && sb.down === 0 && sb.up === 1) return root.sex === 'M' ? g(t.sex, 'тесть', 'тёща', 'родитель жены') : g(t.sex, 'свёкор', 'свекровь', 'родитель мужа');
    if (sb) return root.sex === 'M' ? 'родственник жены' : 'родственник мужа';
  }
  // супруг(а) кровного родственника
  for (const s of spousesOf(targetId)) {
    const sb = blood(rootId, s.id);
    if (sb) {
      if (sb.up === 0 && sb.down === 1) return g(t.sex, 'зять', 'невестка', 'муж/жена ребёнка');
      if (sb.up === 1 && sb.down === 1) return g(t.sex, 'муж сестры', 'жена брата', 'супруг(а) брата/сестры');
      if (sb.up === 2 && sb.down === 1) return g(t.sex, 'муж тёти', 'жена дяди', 'супруг(а) дяди/тёти');
      return 'супруг(а) родственника';
    }
  }
  return 'родственник по браку';
}
export const _internal = { blood, childrenOf };
