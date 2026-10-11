// Раскладка дерева вокруг выбранной персоны: предки сверху (родословная), родные и супруги в одной строке, потомки снизу.
import { parentsOf, childrenOf, spousesOf, siblingsOf } from './data.js';

export const CARD = { w: 220, h: 84, gapX: 56, gapY: 40 };
const MAX_UP = 3, MAX_DOWN = 3;

export function layoutTree(rootId) {
  const W = CARD.w, H = CARD.h, GX = CARD.gapX, GY = CARD.gapY, step = W + GX;
  const pos = new Map();                         // id → {x, y(level), level}
  const put = (id, x, level) => { if (id && !pos.has(id)) pos.set(id, { x, level }); };

  // строка корня: [сёстры/братья] [root] [супруги]
  const spouses = spousesOf(rootId).map((s) => s.id);
  put(rootId, 0, 0);
  spouses.forEach((id, i) => put(id, (i + 1) * step, 0));
  siblingsOf(rootId).forEach((id, i) => put(id, -(i + 1) * step, 0));
  const unitCenter = ((spouses.length) * step) / 2;   // центр пары root+супруги

  // предки: поколение g имеет 2^g мест, отец слева, мать справа
  let maxUp = 0;
  const slots = [[rootId]];
  for (let g = 1; g <= MAX_UP; g++) {
    const prev = slots[g - 1], cur = [];
    for (const id of prev) { const p = id ? parentsOf(id) : {}; cur.push(p.father ?? null, p.mother ?? null); }
    if (!cur.some(Boolean)) break;
    slots.push(cur); maxUp = g;
  }
  for (let g = 1; g <= maxUp; g++) {
    const gap = step * 2 ** (maxUp - g);
    slots[g].forEach((id, i) => put(id, unitCenter + (i - (2 ** g - 1) / 2) * gap, -g));
  }

  // потомки: классическое «опрятное» дерево (ширина поддерева), у каждого — супруги рядом
  function unit(id, depth) {
    const sp = spousesOf(id).map((s) => s.id);
    const kids = depth < MAX_DOWN ? childrenOf(id).filter((c) => !pos.has(c)).map((c) => unit(c, depth + 1)) : [];
    const own = (1 + sp.length) * step - GX;
    const kidsW = kids.reduce((a, k) => a + k.width, 0) + Math.max(0, kids.length - 1) * GX;
    return { id, sp, kids, width: Math.max(own, kidsW), own, depth };
  }
  function place(u, left, level) {
    const x0 = left + (u.width - u.own) / 2;
    put(u.id, x0, level); u.sp.forEach((s, i) => put(s, x0 + (i + 1) * step, level));
    let cx = left + (u.width - (u.kids.reduce((a, k) => a + k.width, 0) + Math.max(0, u.kids.length - 1) * GX)) / 2;
    for (const k of u.kids) { place(k, cx, level + 1); cx += k.width + GX; }
  }
  // дети root; под ними — дети каждого супруга, если у root нет общих
  const descIds = new Set(childrenOf(rootId));
  spouses.forEach((s) => childrenOf(s).forEach((c) => descIds.add(c)));
  const kids = [...descIds].map((c) => unit(c, 1));
  const kidsW = kids.reduce((a, k) => a + k.width, 0) + Math.max(0, kids.length - 1) * GX;
  let cx = unitCenter + W / 2 - kidsW / 2;
  for (const k of kids) { place(k, cx, 1); cx += k.width + GX; }

  // нормализация координат
  const xs = [...pos.values()].map((p) => p.x), levels = [...pos.values()].map((p) => p.level);
  const minX = Math.min(...xs), minL = Math.min(...levels), maxL = Math.max(...levels);
  const pad = 24;
  const nodes = [...pos.entries()].map(([id, p]) => ({ id, x: p.x - minX + pad, y: (p.level - minL) * (H + GY) + pad, level: p.level }));
  const by = new Map(nodes.map((n) => [n.id, n]));
  const width = Math.max(...nodes.map((n) => n.x)) + W + pad, height = (maxL - minL + 1) * (H + GY) - GY + pad * 2;

  // связи берём из данных: родители → ребёнок, супруги
  const links = [], marriages = [];
  for (const n of nodes) {
    const p = parentsOf(n.id); const present = [p.father, p.mother].filter((x) => x && by.has(x)).map((x) => by.get(x));
    if (present.length) links.push({ from: { x: present.reduce((a, q) => a + q.x + W / 2, 0) / present.length, y: present[0].y + H }, to: { x: n.x + W / 2, y: n.y }, child: n.id });
    for (const s of spousesOf(n.id)) if (by.has(s.id) && n.id < s.id) { const a = n.x < by.get(s.id).x ? n : by.get(s.id), b = a === n ? by.get(s.id) : n; if (a.y === b.y) marriages.push({ a, b, dateText: s.dateText }); }
  }
  return { nodes, links, marriages, width, height, root: rootId };
}
