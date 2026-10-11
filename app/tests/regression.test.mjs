// Регрессионные и граничные тесты логики (replica-test). Каждый тест привязан к номеру случая из replica/test-plan.md.
import test from 'node:test';
import assert from 'node:assert/strict';

// общий «localStorage» для двух независимых экземпляров модуля (имитация двух вкладок)
const shared = new Map();
globalThis.localStorage = { getItem: (k) => shared.get(k) ?? null, setItem: (k, v) => shared.set(k, v), removeItem: (k) => shared.delete(k) };
const A = await import('../data.js?tabA');
const B = await import('../data.js?tabB');
const K = await import('../kinship.js');
const { layoutTree } = await import('../tree.js');

test.beforeEach(() => { shared.clear(); A.resetStore(true); });

test('F01-E2 имя из одних пробелов отклоняется', () => {
  assert.throws(() => A.createPerson({ surname: '   ', given_name: ' ' }), /фамилию или имя/);
});
test('F01-E7 смерть раньше рождения отклоняется', () => {
  assert.throws(() => A.createPerson({ given_name: 'А', birth_text: '1990', death_text: '1980' }), /раньше/);
  const p = A.createPerson({ given_name: 'Б', birth_text: '1990', is_living: false, death_text: '1995' });
  assert.throws(() => A.updatePerson(p.id, { death_text: '1980' }, p.version), /раньше/);
});
test('F01-E8 две вкладки: правка в одной не стирает данные другой', () => {
  A.createPerson({ given_name: 'Первый' });
  B.createPerson({ given_name: 'Второй' });          // вкладка B «не видела» первого
  const names = A.listPersons().map((p) => p.given_name).sort();
  assert.deepEqual(names, ['Второй', 'Первый']);
});
test('F01-E8b две вкладки: правка устаревшей записи даёт конфликт, а не затирание', () => {
  const p = A.createPerson({ given_name: 'Общий', occupation: 'a' });
  const stale = B.getPerson(p.id);
  A.updatePerson(p.id, { occupation: 'из вкладки A' }, p.version);
  assert.throws(() => B.updatePerson(p.id, { occupation: 'из вкладки B' }, stale.version), (e) => e.code === 'CONFLICT');
  assert.equal(A.getPerson(p.id).occupation, 'из вкладки A');
});
test('F02-E2 нельзя сменить пол отцу/матери, пока это противоречит событиям', () => {
  const kid = A.createPerson({ given_name: 'Ребёнок', sex: 'M' });
  const f = A.addRelative(kid.id, 'father', { given_name: 'Отец' });
  assert.throws(() => A.updatePerson(f.id, { sex: 'F' }, f.version), /пол/i);
  const w = A.addRelative(A.createPerson({ given_name: 'Муж', sex: 'M' }).id, 'wife', { given_name: 'Жена' });
  assert.throws(() => A.updatePerson(w.id, { sex: 'M' }, w.version), /пол/i);
  // персоне без связей пол менять можно
  const free = A.createPerson({ given_name: 'Свободный', sex: 'M' });
  assert.equal(A.updatePerson(free.id, { sex: 'F' }, free.version).sex, 'F');
});
test('F01-E3 очень длинные значения: слишком длинное имя отклоняется, 60 символов проходит', () => {
  assert.ok(A.createPerson({ surname: 'Я'.repeat(60), given_name: 'Имя' }).id);
  assert.throws(() => A.createPerson({ surname: 'Я'.repeat(300) }), /длин/i);
  assert.throws(() => A.createPerson({ given_name: 'А', comment: 'x'.repeat(20001) }), /длин/i);
});
test('F01-E4 эмодзи и ударения сохраняются как есть', () => {
  const p = A.createPerson({ given_name: 'Ёлка 🌲', surname: 'Ле́вин' });
  assert.equal(A.getPerson(p.id).given_name, 'Ёлка 🌲');
});
test('F01-N1 недоступное хранилище не роняет слой данных', async () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  try {
    const C = await import('../data.js?tabC');
    assert.doesNotThrow(() => C.listPersons());
    assert.doesNotThrow(() => C.createPerson({ given_name: 'В памяти' }));
  } finally { globalThis.localStorage = saved; }
});
test('F02-N1 удаление родителя не ломает детей и родство', () => {
  const kid = A.createPerson({ given_name: 'К', sex: 'M' });
  const f = A.addRelative(kid.id, 'father', { given_name: 'О' });
  A.deletePerson(f.id);
  assert.equal(A.parentsOf(kid.id).father, null);
  assert.equal(A.getPerson(kid.id).given_name, 'К');
  assert.doesNotThrow(() => layoutTree(kid.id));
});
test('F02-E4 повторное добавление того же вида родственника блокируется для мать/отец', () => {
  const kid = A.createPerson({ given_name: 'К', sex: 'F' });
  A.addRelative(kid.id, 'mother', { given_name: 'М' });
  assert.throws(() => A.addRelative(kid.id, 'mother', { given_name: 'М2' }), /уже указана/);
  assert.equal(A.listPersons().length, 2);              // второй человек не создался (откат)
});
test('F05-E4 случайные семьи: дерево строится, карточки не пересекаются, родство не падает', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const kinds = ['father', 'mother', 'brother', 'sister', 'wife', 'husband', 'son', 'daughter'];
  for (let round = 0; round < 25; round++) {
    A.resetStore(true);
    A.createPerson({ given_name: 'Корень', sex: rnd() < 0.5 ? 'M' : 'F' });
    for (let i = 0; i < 40; i++) {
      const ps = A.listPersons(); const p = ps[Math.floor(rnd() * ps.length)]; const k = kinds[Math.floor(rnd() * kinds.length)];
      if (!A.canAddRelative(p.id, k).ok) continue;
      const opts = {}; if (k === 'son' || k === 'daughter') { const sp = A.spousesOf(p.id); if (sp.length && rnd() < 0.7) opts.otherParentId = sp[Math.floor(rnd() * sp.length)].id; }
      A.addRelative(p.id, k, { given_name: `P${round}-${i}` }, opts);
    }
    for (const p of A.listPersons()) {
      const L = layoutTree(p.id);
      for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) {
        const a = L.nodes[i], b = L.nodes[j];
        if (a.y === b.y) assert.ok(Math.abs(a.x - b.x) >= 220, `пересечение карточек (раунд ${round}, корень ${p.given_name})`);
      }
      assert.ok(L.nodes.every((n) => n.x >= 0 && n.y >= 0 && Number.isFinite(n.x)));
      for (const n of L.nodes) assert.ok(typeof K.relationName(p.id, n.id) === 'string');
    }
  }
});
