import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../data.js';
import { relationName } from '../kinship.js';
import { layoutTree } from '../tree.js';

const byName = (n) => D.listPersons().find((p) => D.displayName(p).startsWith(n));
test.beforeEach(() => D.resetStore());

test('даты разбираются и ошибки понятны', () => {
  assert.equal(D.parseDate('26.05.1799').sort, '1799-05-26');
  assert.equal(D.parseDate('1799').sort, '1799-01-01');
  assert.equal(D.parseDate('05.1799').sort, '1799-05-01');
  assert.equal(D.parseDate('около 1717').kind, 'about');
  assert.equal(D.parseDate('между 1811 и 1817').kind, 'between');
  assert.ok(D.parseDate('31.02.1900').error);
  assert.ok(D.parseDate('между 1900 и 1800').error);
  assert.equal(D.parseDate('').kind, 'none');
});
test('родство вычисляется из событий', () => {
  const alex = byName('Иванов Алексей'), nik = byName('Иванов Николай');
  assert.equal(D.parentsOf(alex.id).father, nik.id);
  assert.equal(D.childrenOf(nik.id).length, 2);
  assert.equal(D.siblingsOf(alex.id).length, 1);
});
test('названия родства', () => {
  const alex = byName('Иванов Алексей').id;
  const name = (n) => relationName(alex, byName(n).id);
  assert.equal(name('Иванов Николай'), 'отец');
  assert.equal(name('Иванова Елена'), 'мать');
  assert.equal(name('Иванов Пётр'), 'дед');
  assert.equal(name('Иванова Анна'), 'бабушка');
  assert.equal(name('Смирнова Ольга'), 'сестра');
  assert.equal(name('Кузнецова Мария'), 'тётя');
  assert.equal(name('Кузнецов Дмитрий'), 'двоюродный брат');
  assert.equal(name('Иванова Ирина'), 'жена');
  assert.equal(name('Иванов Максим'), 'сын');
  assert.equal(name('Кузнецов Виктор'), 'муж тёти');
  const max = byName('Иванов Максим').id;
  assert.equal(relationName(max, byName('Иванов Пётр').id), 'прадед');
  assert.equal(relationName(byName('Иванов Пётр').id, max), 'правнук');
  const ir = byName('Иванова Ирина').id;
  assert.equal(relationName(ir, byName('Иванов Николай').id), 'свёкор');
});
test('правила добавления родственников', () => {
  const p = D.createPerson({ surname: 'Тестов', given_name: 'Один', sex: 'M' });
  assert.equal(D.canAddRelative(p.id, 'brother').ok, false);       // нет родителей
  assert.equal(D.canAddRelative(p.id, 'husband').ok, false);       // мужу — только женщине
  assert.equal(D.canAddRelative(p.id, 'wife').ok, true);
  const f = D.addRelative(p.id, 'father', { surname: 'Тестов', given_name: 'Отец' });
  assert.equal(D.canAddRelative(p.id, 'father').ok, false);        // отец уже есть
  assert.throws(() => D.addRelative(p.id, 'father', { given_name: 'Второй' }), /уже указан/);
  const b = D.addRelative(p.id, 'brother', { surname: 'Тестов', given_name: 'Брат' });
  assert.equal(D.parentsOf(b.id).father, f.id);
  assert.deepEqual(D.siblingsOf(p.id), [b.id]);
  const u = D.createPerson({ given_name: 'Без пола' });
  assert.equal(D.canAddRelative(u.id, 'son').ok, false);
});
test('брак и ребёнок с вторым родителем', () => {
  const a = D.createPerson({ given_name: 'Муж', sex: 'M' });
  const w = D.addRelative(a.id, 'wife', { given_name: 'Жена', marriage_text: '1990' });
  assert.equal(D.spousesOf(a.id)[0].id, w.id); assert.equal(D.spousesOf(a.id)[0].dateText, '1990');
  const c = D.addRelative(a.id, 'daughter', { given_name: 'Дочь' }, { otherParentId: w.id });
  assert.deepEqual(D.parentsOf(c.id), { father: a.id, mother: w.id, eventId: D.parentsOf(c.id).eventId });
  assert.throws(() => D.addRelative(a.id, 'son', { given_name: 'X' }, { otherParentId: a.id }), /другого пола/);
  // после ошибки данные откатились: у мужа один ребёнок
  assert.equal(D.childrenOf(a.id).length, 1);
});
test('блокировка версии и удаление', () => {
  const p = D.createPerson({ given_name: 'А', sex: 'F' });
  D.updatePerson(p.id, { occupation: 'x' }, p.version);
  assert.throws(() => D.updatePerson(p.id, { occupation: 'y' }, p.version), (e) => e.code === 'CONFLICT');
  const nik = byName('Иванов Николай').id;
  D.deletePerson(nik);
  assert.equal(D.getPerson(nik), null);
  assert.equal(D.parentsOf(byName('Иванов Алексей').id).father, null);
});
test('валидация', () => {
  assert.throws(() => D.createPerson({}), /фамилию или имя/);
  assert.throws(() => D.createPerson({ given_name: 'А', birth_text: '32.13.2000' }), /Не разобрал дату/);
  assert.throws(() => D.createPerson({ given_name: 'А', privacy_level: 11 }), /от 0 до 10/);
});
test('раскладка дерева без пересечений карточек', () => {
  const alex = byName('Иванов Алексей').id;
  const L = layoutTree(alex);
  assert.ok(L.nodes.length === 8);
  for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) {
    const a = L.nodes[i], b = L.nodes[j];
    if (a.y === b.y) assert.ok(Math.abs(a.x - b.x) >= 220, `пересечение ${a.id} и ${b.id}`);
  }
  assert.ok(L.nodes.every((n) => n.x >= 0 && n.y >= 0));
});
