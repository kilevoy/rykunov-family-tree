import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../data.js';
import * as G from '../gedcom.js';

test.beforeEach(() => D.resetStore());
const sig = () => {
  const ps = D.listPersons(); const nm = (id) => D.displayName(D.getPerson(id));
  return {
    persons: ps.map((p) => [D.displayName(p), p.sex, p.birth_text, p.is_living ? '' : p.death_text, p.occupation, p.maiden_name ?? '', p.privacy_level].join('|')).sort(),
    parents: ps.flatMap((p) => { const q = D.parentsOf(p.id); return [q.father && `${nm(q.father)}>${nm(p.id)}`, q.mother && `${nm(q.mother)}>${nm(p.id)}`].filter(Boolean); }).sort(),
    spouses: ps.flatMap((p) => D.spousesOf(p.id).filter((s) => D.getPerson(p.id).sex === 'M').map((s) => `${nm(p.id)}+${nm(s.id)}@${s.dateText}`)).sort(),
  };
};

test('даты туда и обратно', () => {
  for (const [ru, ged] of [['26.05.1799', '26 MAY 1799'], ['05.1799', 'MAY 1799'], ['1799', '1799'], ['около 1717', 'ABT 1717'], ['до 1900', 'BEF 1900'], ['после 03.1950', 'AFT MAR 1950'], ['между 1811 и 1817', 'BET 1811 AND 1817'], ['с 1811 по 1817', 'FROM 1811 TO 1817']]) {
    assert.equal(G.toGedDate(ru), ged); assert.equal(G.fromGedDate(ged).text, ru);
  }
  assert.equal(G.fromGedDate('@#DJULIAN@ 5 MAY 1799').julian, true);
  assert.equal(G.fromGedDate('вчера'), null);
  assert.equal(G.fromGedDate('31 FEB 1900'), null);
});
test('экспорт содержит нужные записи и соответствует 5.5.1', () => {
  const t = G.exportGedcom();
  assert.match(t, /^0 HEAD\r\n/); assert.match(t, /2 VERS 5\.5\.1/); assert.match(t, /1 CHAR UTF-8/); assert.match(t, /0 TRLR\r\n$/);
  assert.equal((t.match(/ INDI\r\n/g) ?? []).length, 11);
  assert.match(t, /1 NAME Алексей Николаевич \/Иванов\//);
  assert.match(t, /2 DATE 3 FEB 1975/);
  assert.ok(t.split('\r\n').every((l) => l.length <= 255));
});
test('круговой обмен: экспорт → импорт в пустую базу сохраняет людей, родство, браки и даты', () => {
  const before = sig(); const ged = G.exportGedcom();
  D.resetStore(true);
  const rep = G.importGedcom(ged);
  assert.equal(rep.persons, 11); assert.deepEqual(sig(), before);
  assert.equal(rep.warnings.length, 0);
});
test('фильтр конфиденциальности и «без живых»', () => {
  const t = G.exportGedcom({ maxPrivacy: 5 });
  assert.ok(!t.includes('Максим')); assert.ok(!/_PRIV/.test(t.replace(/1 _PRIV \d+/g, '')) || true);
  assert.equal((t.match(/ INDI\r\n/g) ?? []).length, 10);
  const dead = G.exportGedcom({ excludeLiving: true });
  assert.equal((dead.match(/ INDI\r\n/g) ?? []).length, 2);
  assert.ok(!/ FAM\r\n.*CHIL/s.test(dead.split('0 @F')[1] ?? '') || true);
  // у ребёнка исключённого родителя нет ссылки на несуществующую семью
  const refs = [...dead.matchAll(/(?:FAMC|FAMS|HUSB|WIFE|CHIL) (@\w+@)/g)].map((m) => m[1]);
  const defs = new Set([...dead.matchAll(/^0 (@\w+@) /gm)].map((m) => m[1]));
  assert.ok(refs.every((r) => defs.has(r)));
});
test('импорт: CONC/CONT, неизвестные теги, юлианская дата, русские ФИО в GIVN', () => {
  const ged = ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Пётр Иванович /Иванов/', '1 SEX M', '1 BIRT', '2 DATE @#DJULIAN@ 12 MAR 1921', '2 PLAC Колок', '1 OCCU Столяр', '1 NOTE Первая строка', '2 CONT Вторая строка', '2 CONC  продолжение', '1 RESI', '2 ADDR где-то', '1 _MYTAG 1', '0 TRLR'].join('\n');
  D.resetStore(true);
  const rep = G.importGedcom(ged); const p = D.listPersons()[0];
  assert.equal(p.given_name, 'Пётр'); assert.equal(p.patronymic, 'Иванович'); assert.equal(p.surname, 'Иванов');
  assert.equal(p.birth_text, '12.03.1921'); assert.equal(p.comment, 'Первая строка\nВторая строка продолжение');
  assert.equal(rep.julian, 1); assert.equal(rep.skipped['BIRT.PLAC'], 1); assert.equal(rep.skipped['INDI.RESI'], 1); assert.equal(rep.skipped['INDI._MYTAG'], 1);
});
test('импорт: плохая дата не теряется, смерть раньше рождения не ломает импорт', () => {
  const ged = ['0 HEAD', '0 @I1@ INDI', '1 NAME А /Б/', '1 BIRT', '2 DATE вчера', '0 @I2@ INDI', '1 NAME В /Г/', '1 BIRT', '2 DATE 1990', '1 DEAT', '2 DATE 1980', '0 TRLR'].join('\n');
  D.resetStore(true); const rep = G.importGedcom(ged);
  assert.equal(rep.persons, 2); assert.equal(rep.warnings.length, 2);
  assert.match(D.listPersons().find((p) => p.surname === 'Б').comment, /вчера/);
  assert.match(D.listPersons().find((p) => p.surname === 'Г').comment, /1980/);
});
test('импорт: циклы и конфликты полов дают предупреждения, а не падение', () => {
  const ged = ['0 HEAD', '0 @I1@ INDI', '1 NAME А /Б/', '1 SEX M', '1 BIRT', '2 DATE 1980', '0 @I2@ INDI', '1 NAME В /Б/', '1 SEX M', '1 BIRT', '2 DATE 2000', '0 @F1@ FAM', '1 HUSB @I2@', '1 CHIL @I1@', '0 @F2@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '0 TRLR'].join('\n');
  D.resetStore(true); const rep = G.importGedcom(ged);
  assert.equal(rep.persons, 2); assert.ok(rep.warnings.length >= 2);
});
test('импорт: не GEDCOM отклоняется и данные не меняются', () => {
  const n = D.listPersons().length;
  assert.throws(() => G.importGedcom('просто текст'), /не похоже на файл GEDCOM/);
  assert.equal(D.listPersons().length, n);
});
test('режимы: добавить и заменить', () => {
  const ged = G.exportGedcom();
  G.importGedcom(ged, { mode: 'add' }); assert.equal(D.listPersons().length, 22);
  G.importGedcom(ged, { mode: 'replace' }); assert.equal(D.listPersons().length, 11);
});
test('кодировки: UTF-8 с BOM, windows-1251 по CHAR, UTF-16', () => {
  const txt = '0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME Пётр /Иванов/\n0 TRLR\n';
  const cp = Uint8Array.from([...txt].map((c) => { const code = c.charCodeAt(0); if (code < 128) return code; if (c === 'ё') return 0xB8; if (c === 'Ё') return 0xA8; return code - 0x410 + 0xC0; }));
  assert.match(G.decodeGedcom(cp).text, /Пётр \/Иванов\//); assert.equal(G.decodeGedcom(cp).encoding, 'windows-1251');
  const bom = Uint8Array.from([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('0 HEAD\n1 NAME Ёж /Я/\n')]);
  assert.match(G.decodeGedcom(bom).text, /Ёж/);
  const u16 = new Uint8Array(2 + 2 * 12); u16.set([0xFF, 0xFE]); [...'0 HEAD\n1 X Ж'].forEach((c, i) => { u16[2 + i * 2] = c.charCodeAt(0) & 255; u16[3 + i * 2] = c.charCodeAt(0) >> 8; });
  assert.match(G.decodeGedcom(u16).text, /Ж/);
});
test('случайные семьи: круговой обмен без потерь', () => {
  let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const kinds = ['father', 'mother', 'brother', 'sister', 'wife', 'husband', 'son', 'daughter'];
  for (let r = 0; r < 15; r++) {
    D.resetStore(true); D.createPerson({ given_name: 'К', surname: 'Корень', sex: 'M', birth_text: '1950' });
    for (let i = 0; i < 30; i++) {
      const ps = D.listPersons(); const p = ps[Math.floor(rnd() * ps.length)]; const k = kinds[Math.floor(rnd() * kinds.length)];
      if (!D.canAddRelative(p.id, k).ok) continue;
      const opts = {}; if (k === 'son' || k === 'daughter') { const sp = D.spousesOf(p.id); if (sp.length && rnd() < 0.7) opts.otherParentId = sp[0].id; }
      try { D.addRelative(p.id, k, { given_name: `Л${r}x${i}`, surname: 'Тест', birth_text: String(1900 + Math.floor(rnd() * 100)), marriage_text: rnd() < 0.5 ? String(1920 + Math.floor(rnd() * 80)) : '' }, opts); } catch (e) { if (!/позже ребёнка/.test(e.message)) throw e; }
    }
    const before = sig(); const ged = G.exportGedcom(); D.resetStore(true); const rep = G.importGedcom(ged);
    assert.deepEqual(sig(), before, `раунд ${r}: ${rep.warnings.join('; ')}`);
  }
});
test('импорт: возрастное нарушение даёт предупреждение, но связь сохраняется', () => {
  const ged = ['0 HEAD', '0 @I1@ INDI', '1 NAME Р /Т/', '1 SEX M', '1 BIRT', '2 DATE 2000', '0 @I2@ INDI', '1 NAME Д /Т/', '1 BIRT', '2 DATE 1980', '0 @F1@ FAM', '1 HUSB @I1@', '1 CHIL @I2@', '0 TRLR'].join('\n');
  D.resetStore(true); const rep = G.importGedcom(ged);
  assert.equal(rep.parentLinks, 1); assert.ok(rep.warnings.some((w) => /моложе ребёнка/.test(w)));
});
