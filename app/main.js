import * as D from './data.js';
import { relationName } from './kinship.js';
import { layoutTree, CARD } from './tree.js';
import * as G from './gedcom.js';

const $ = (s) => document.querySelector(s);
// В окне просмотра (встроенная страница) нельзя печатать и скачивать файлы: кнопки печати скрываются, файлы показываются текстом.
const PRINT = !globalThis.__NOPRINT;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = [['persons', 'Персоны'], ['tree', 'Древо'], ['events', 'События'], ['documents', 'Документы'], ['places', 'Места'], ['sources', 'Источники'], ['families', 'Роды'], ['tasks', 'Задачи']];
const state = { selected: null, q: '', onlyLiving: false, zoom: 1 };
const initial = (p) => ((p.given_name || p.surname || '?')[0] || '?').toUpperCase();
const sexLabel = { M: 'мужской', F: 'женский', U: 'не указан' };

function route() {
  const [, name = 'persons', arg] = location.hash.split('/');
  return { name, arg };
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4000); }
function banner(msg) { const b = $('#banner'); b.innerHTML = `${esc(msg)} <button id="bx">Закрыть</button>`; b.hidden = false; $('#bx').onclick = () => (b.hidden = true); }
function guard(fn) { try { return fn(); } catch (e) { banner(e.message || 'Не удалось выполнить действие'); return undefined; } }

// ---------- каркас ----------
function renderShell() {
  const { name } = route(); const n = D.listPersons().length;
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<a role="tab" href="#/${k}${k === 'tree' && state.selected ? '/' + state.selected : ''}" aria-selected="${k === name}">${t}${k === 'persons' || k === 'tree' ? ` <span class="cnt">${n}</span>` : ''}</a>`).join('');
  const sel = state.selected && D.getPerson(state.selected);
  const dis = sel ? '' : 'disabled';
  $('#actions').innerHTML = `
    <button class="primary" id="a-new">Добавить человека</button>
    <button id="a-rel" ${dis}>Добавить родственника…</button>
    <button id="a-edit" ${dis}>Изменить</button>
    <button id="a-del" class="danger" ${dis}>Удалить</button>
    <button id="a-tree" ${dis}>Показать на древе</button>
    <button id="a-page" ${dis}>Страница человека</button>
    <hr style="width:100%;border:0;border-top:1px solid var(--color-border)">
    <button id="a-gexp">Экспорт GEDCOM…</button>
    <button id="a-gimp">Импорт GEDCOM…</button>
    <button id="a-bak">Резервная копия…</button>
    <button id="a-reset" class="ghost">Сбросить тестовые данные</button>`;
  $('#a-page').onclick = () => (location.hash = `#/person/${state.selected}`);
  $('#a-gexp').onclick = openExportDialog;
  $('#a-gimp').onclick = openImportDialog;
  $('#a-bak').onclick = openBackupDialog;
  $('#a-new').onclick = () => openPersonForm();
  $('#a-rel').onclick = () => openRelativeDialog(state.selected);
  $('#a-edit').onclick = () => openPersonForm(state.selected);
  $('#a-del').onclick = () => confirmDelete(state.selected);
  $('#a-tree').onclick = () => (location.hash = `#/tree/${state.selected}`);
  $('#a-reset').onclick = () => confirmBox('Сбросить тестовые данные?', 'Все введённые здесь данные в этом браузере будут заменены вымышленным примером.', () => { D.resetStore(); state.selected = null; render(); toast('Данные сброшены'); });
}
function render() {
  const { name, arg } = route();
  if (arg) state.selected = arg;
  if (state.selected && !D.getPerson(state.selected)) state.selected = null;
  renderShell();
  const m = $('#main');
  if (name === 'persons') renderPersons(m);
  else if (name === 'tree') renderTree(m);
  else if (name === 'person') renderPerson(m);
  else renderStub(m, name);
}

function renderStub(m, name) {
  const t = TABS.find(([k]) => k === name)?.[1] ?? 'Раздел';
  m.innerHTML = `<h2>${esc(t)}</h2><p class="stub">Этот раздел появится на следующих этапах сборки (см. replica/architecture.md). Сейчас доступны «Персоны» и «Древо».</p>`;
}

// ---------- персоны ----------
function renderPersons(m) {
  const all = D.listPersons();
  const rows = D.listPersons({ q: state.q, onlyLiving: state.onlyLiving });
  m.innerHTML = `
    <div class="toolbar">
      <div><label for="q" class="sr">Поиск</label><input id="q" type="search" placeholder="Поиск по имени, фамилии, занятию" value="${esc(state.q)}"></div>
      <div class="check"><input type="checkbox" id="liv" ${state.onlyLiving ? 'checked' : ''}><label for="liv">Только живые</label></div>
    </div>
    ${all.length === 0 ? `<div class="empty"><h2>Пока никого нет</h2><p>Начните с одного человека, остальных можно добавлять как родственников.</p><button class="primary" id="e-new">Добавить первого человека</button></div>`
      : rows.length === 0 ? `<div class="empty"><p>По запросу ничего не найдено.</p></div>`
      : `<table><thead><tr><th scope="col"></th><th scope="col">Полное имя</th><th scope="col">Годы жизни</th><th scope="col">Занятие</th><th scope="col"></th></tr></thead><tbody>
        ${rows.map((p) => `<tr tabindex="0" data-id="${p.id}" aria-selected="${p.id === state.selected}">
          <td><div class="ava ${p.sex}" aria-hidden="true">${esc(initial(p))}</div></td>
          <td data-l="Имя"><strong>${esc(D.displayName(p))}</strong>${p.maiden_name ? `<div class="hint">урожд. ${esc(p.maiden_name)}</div>` : ''}</td>
          <td data-l="Годы">${esc(D.lifeText(p))}${p.is_living ? ' (жив)' : ''}</td>
          <td data-l="Занятие">${esc(p.occupation)}</td>
          <td>${p.privacy_level >= 6 ? '<span class="lock" title="Ограниченный доступ">🔒 ' + p.privacy_level + '</span>' : ''}</td></tr>`).join('')}
      </tbody></table>`}
    <div id="preview"></div>`;
  $('#e-new')?.addEventListener('click', () => openPersonForm());
  $('#q').oninput = (e) => { state.q = e.target.value; const pos = e.target.selectionStart; renderPersons(m); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
  $('#liv').onchange = (e) => { state.onlyLiving = e.target.checked; renderPersons(m); };
  m.querySelectorAll('tbody tr').forEach((tr) => {
    const pick = () => { state.selected = tr.dataset.id; renderShell(); renderPersons(m); };
    tr.onclick = pick; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });
  renderPreview();
}
function personLink(id, rel) { const p = D.getPerson(id); return p ? `<button class="link" data-go="${id}">${esc(D.displayName(p))}</button>${rel ? ` <span class="hint">${esc(rel)}</span>` : ''}` : ''; }
function renderPreview() {
  const box = $('#preview'); if (!box) return;
  const p = state.selected && D.getPerson(state.selected);
  if (!p) { box.innerHTML = `<div class="panel"><p class="stub">Выберите человека в таблице, чтобы увидеть сведения.</p></div>`; return; }
  const par = D.parentsOf(p.id), sp = D.spousesOf(p.id), ch = D.childrenOf(p.id), sib = D.siblingsOf(p.id);
  const li = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<span class="hint">нет данных</span>');
  box.innerHTML = `<section class="panel" aria-label="Сведения о человеке">
    <h2>${esc(D.displayName(p))}</h2>
    <p><a href="#/person/${p.id}">Открыть страницу человека</a> · <a href="#/tree/${p.id}">Показать на древе</a></p>
    <dl>
      <dt>Родился(ась)</dt><dd>${esc(p.birth_text) || '<span class="hint">нет данных</span>'}</dd>
      <dt>${p.is_living ? 'Статус' : 'Умер(ла)'}</dt><dd>${p.is_living ? 'жив(а)' : esc(p.death_text) || '<span class="hint">нет данных</span>'}</dd>
      <dt>Пол</dt><dd>${sexLabel[p.sex]}</dd>
      ${p.occupation ? `<dt>Занятие</dt><dd>${esc(p.occupation)}</dd>` : ''}
      ${p.comment ? `<dt>Комментарий</dt><dd>${esc(p.comment)}</dd>` : ''}
      <dt>Конфиденциальность</dt><dd>${p.privacy_level} из 10</dd>
    </dl>
    <div class="rels row">
      <div><strong>Родители</strong>${li([par.father && personLink(par.father), par.mother && personLink(par.mother)].filter(Boolean))}</div>
      <div><strong>Супруги</strong>${li(sp.map((s) => personLink(s.id) + (s.dateText ? ` <span class="hint">брак ${esc(s.dateText)}</span>` : '')))}</div>
      <div><strong>Дети</strong>${li(ch.map((c) => personLink(c)))}</div>
      <div><strong>Братья и сёстры</strong>${li(sib.map((c) => personLink(c)))}</div>
    </div></section>`;
  box.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.selected = b.dataset.go; render(); }));
}

// ---------- древо ----------
function renderTree(m) {
  if (!state.selected) {
    const first = D.listPersons();
    if (!first.length) { m.innerHTML = `<div class="empty"><h2>Древо пусто</h2><p>Добавьте первого человека на вкладке «Персоны».</p><a class="btn" href="#/persons">К персонам</a></div>`; return; }
    state.selected = first[0].id;
  }
  const root = D.getPerson(state.selected);
  const L = layoutTree(root.id);
  const z = state.zoom;
  const cardSvg = (n) => {
    const p = D.getPerson(n.id); const isRoot = n.id === root.id; const rel = isRoot ? '' : relationName(root.id, n.id);
    const sex = p.sex; const name = D.displayName(p);
    const nm = name.length > 26 ? name.slice(0, 25) + '…' : name;
    const lines = [nm.length > 18 ? [nm.slice(0, nm.lastIndexOf(' ', 18) > 0 ? nm.lastIndexOf(' ', 18) : 18), nm.slice(nm.lastIndexOf(' ', 18) > 0 ? nm.lastIndexOf(' ', 18) + 1 : 18)] : [nm]].flat();
    const label = `${name}, ${D.lifeText(p)}${rel ? ', ' + rel : ''}`;
    return `<g class="card ${isRoot ? 'sel' : ''}" data-id="${n.id}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${esc(label)}">
      <rect class="bg fill${sex}" width="${CARD.w}" height="${CARD.h}"></rect>
      <rect class="${'fill' + sex}" x="0" y="0" width="${CARD.h}" height="${CARD.h}" rx="12" opacity=".0"></rect>
      <text x="${CARD.h / 2}" y="${CARD.h / 2 + 10}" text-anchor="middle" style="font:700 28px var(--font-sans);fill:var(--color-on-card)" aria-hidden="true">${esc(initial(p))}</text>
      <line x1="${CARD.h}" y1="8" x2="${CARD.h}" y2="${CARD.h - 8}" stroke="var(--color-border-input)" stroke-width=".5"></line>
      ${lines.map((t, i) => `<text class="nm" x="${CARD.h + 8}" y="${22 + i * 16}">${esc(t)}</text>`).join('')}
      <text class="dt" x="${CARD.h + 8}" y="${22 + lines.length * 16 + 2}">${esc(D.lifeText(p))}</text>
      ${rel ? `<text class="rel" x="${CARD.h + 8}" y="${CARD.h - 10}">${esc(rel)}</text>` : ''}
      ${p.privacy_level >= 6 ? `<text x="${CARD.w - 18}" y="18" font-size="12" aria-hidden="true">🔒</text>` : ''}</g>`;
  };
  const linkPath = (l) => { const my = (l.from.y + l.to.y) / 2 + 6; return `<path class="link-line" d="M${l.from.x},${l.from.y} V${my} H${l.to.x} V${l.to.y}"></path>`; };
  const marr = (mm) => { const x1 = mm.a.x + CARD.w, x2 = mm.b.x, y = mm.a.y + CARD.h / 2; return `<line class="spouse-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>${mm.dateText ? `<text class="mdate" x="${(x1 + x2) / 2}" y="${y - 4}" text-anchor="middle">${esc(mm.dateText)}</text>` : ''}`; };
  m.innerHTML = `
    <div class="toolbar"><h2 style="margin:0">Древо: ${esc(D.displayName(root))}</h2>
      <button id="zo" aria-label="Уменьшить">−</button><span aria-live="polite">${Math.round(z * 100)}%</span><button id="zi" aria-label="Увеличить">+</button><button id="z1">100%</button>${PRINT ? '<button id="prn">Печать / PDF</button>' : ''}</div>
    <div class="treewrap"><svg id="svg" width="${L.width * z}" height="${L.height * z}" viewBox="0 0 ${L.width} ${L.height}" role="group" aria-label="Родословное древо">
      ${L.links.map(linkPath).join('')}${L.marriages.map(marr).join('')}${L.nodes.map(cardSvg).join('')}</svg></div>
    <section class="panel rels" aria-label="Родство списком"><h2>Родство списком</h2><ul>
      ${L.nodes.filter((n) => n.id !== root.id).sort((a, b) => a.level - b.level).map((n) => `<li>${personLink(n.id, relationName(root.id, n.id))}</li>`).join('')}</ul></section>`;
  m.querySelectorAll('.card').forEach((g) => {
    const go = () => { state.selected = g.dataset.id; location.hash = `#/tree/${g.dataset.id}`; if (location.hash === `#/tree/${g.dataset.id}`) render(); };
    g.onclick = go; g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.selected = b.dataset.go; location.hash = `#/tree/${b.dataset.go}`; }));
  $('#zi').onclick = () => { state.zoom = Math.min(2, +(state.zoom + 0.1).toFixed(2)); renderTree(m); };
  $('#zo').onclick = () => { state.zoom = Math.max(0.4, +(state.zoom - 0.1).toFixed(2)); renderTree(m); };
  $('#z1').onclick = () => { state.zoom = 1; renderTree(m); };
  $('#prn')?.addEventListener('click', () => window.print());
}

// ---------- диалоги ----------
function openDialog(html) { const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal(); return d; }
const closeDialog = () => $('#dlg').close();
// BUG-008: после действия перерисовка убирает элемент с фокусом — возвращаем фокус на выбранную строку или область содержимого
function restoreFocus() {
  const el = document.querySelector('tbody tr[aria-selected="true"]') ?? document.querySelector('.card.sel') ?? $('#main');
  el?.focus();
}

function confirmBox(title, text, onYes) {
  const d = openDialog(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="foot"><button id="no">Отмена</button><button id="yes" class="danger">Подтвердить</button></div>`);
  d.querySelector('#no').onclick = closeDialog; d.querySelector('#yes').onclick = () => { closeDialog(); onYes(); restoreFocus(); };
}
function confirmDelete(id) {
  const p = D.getPerson(id); if (!p) return;
  confirmBox(`Удалить «${D.displayName(p)}»?`, 'Человек исчезнет из всех событий. Связанные люди останутся. Отменить нельзя.', () => { D.deletePerson(id); state.selected = null; render(); toast('Удалено'); });
}

function personForm(p, ctx = {}) {
  const v = p ?? {}; const sexFixed = ctx.sex;
  return `<h2>${esc(ctx.title ?? (p ? 'Изменить человека' : 'Новый человек'))}</h2>
  <form id="pf" novalidate>
    <div class="row">
      <div class="field"><label for="f-surname">Фамилия</label><input id="f-surname" name="surname" value="${esc(v.surname)}" autocomplete="off"></div>
      <div class="field"><label for="f-given">Имя</label><input id="f-given" name="given_name" value="${esc(v.given_name)}" autocomplete="off"></div>
      <div class="field"><label for="f-pat">Отчество</label><input id="f-pat" name="patronymic" value="${esc(v.patronymic)}" autocomplete="off"></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-sex">Пол</label><select id="f-sex" name="sex" ${sexFixed ? 'disabled' : ''}>${['M', 'F', 'U'].map((s) => `<option value="${s}" ${(sexFixed ?? v.sex ?? 'U') === s ? 'selected' : ''}>${sexLabel[s]}</option>`).join('')}</select></div>
      <div class="field"><label for="f-maiden">Девичья фамилия</label><input id="f-maiden" name="maiden_name" value="${esc(v.maiden_name)}"></div>
    </div>
    <div class="check field"><input type="checkbox" id="f-live" name="is_living" ${v.is_living ?? true ? 'checked' : ''}><label for="f-live">В живых</label></div>
    <div class="row">
      <div class="field"><label for="f-birth">Дата рождения</label><input id="f-birth" name="birth_text" value="${esc(v.birth_text)}" aria-describedby="h-d"><div class="hint" id="h-d">26.05.1799, 05.1799, 1799, около 1717, между 1811 и 1817</div></div>
      <div class="field" id="death-box"><label for="f-death">Дата смерти</label><input id="f-death" name="death_text" value="${esc(v.death_text)}"></div>
      ${ctx.marriage ? `<div class="field"><label for="f-marr">Дата брака</label><input id="f-marr" name="marriage_text" value=""></div>` : ''}
    </div>
    <div class="field"><label for="f-occ">Занятие</label><input id="f-occ" name="occupation" value="${esc(v.occupation)}"></div>
    ${ctx.otherParents ? `<div class="field"><label for="f-op">Второй родитель</label><select id="f-op" name="other_parent"><option value="">не указан</option>${ctx.otherParents.map((o) => `<option value="${o.id}">${esc(D.displayName(o))}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label for="f-com">Комментарий</label><textarea id="f-com" name="comment">${esc(v.comment)}</textarea></div>
    <div class="field"><label for="f-priv">Конфиденциальность: <output id="priv-o">${v.privacy_level ?? 0}</output> из 10</label><input id="f-priv" name="privacy_level" type="range" min="0" max="10" value="${v.privacy_level ?? 0}"><div class="hint">Живых родственников лучше ставить от 6 и выше: читатели с меньшим уровнем доступа их не увидят (в рабочей версии).</div></div>
    <div id="form-err" class="err" role="alert" style="color:var(--color-danger)"></div>
    <div class="foot"><button type="button" id="cancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div>
  </form>`;
}
function bindForm(d, onSubmit, sexFixed) {
  const f = d.querySelector('#pf');
  const toggle = () => { d.querySelector('#death-box').hidden = f.is_living.checked; };
  f.is_living.onchange = toggle; toggle();
  f.privacy_level.oninput = () => (d.querySelector('#priv-o').textContent = f.privacy_level.value);
  d.querySelector('#cancel').onclick = closeDialog;
  f.onsubmit = (e) => {
    e.preventDefault();
    if (f.dataset.busy) return;                       // BUG-002: повторное нажатие игнорируем
    f.dataset.busy = '1';
    const data = {
      surname: f.surname.value, given_name: f.given_name.value, patronymic: f.patronymic.value, maiden_name: f.maiden_name.value,
      sex: sexFixed ?? f.sex.value, is_living: f.is_living.checked, birth_text: f.birth_text.value, death_text: f.is_living.checked ? '' : f.death_text.value,
      occupation: f.occupation.value, comment: f.comment.value, privacy_level: +f.privacy_level.value,
    };
    if (f.marriage_text) data.marriage_text = f.marriage_text.value;
    try { onSubmit(data, f.other_parent?.value || null); closeDialog(); restoreFocus(); }
    catch (err) { d.querySelector('#form-err').textContent = err.message; delete f.dataset.busy; }
  };
  f.surname.focus();
}
function openPersonForm(id) {
  const p = id ? D.getPerson(id) : null;
  const d = openDialog(personForm(p));
  bindForm(d, (data) => {
    if (p) { D.updatePerson(p.id, data, p.version); toast('Сохранено'); }
    else { const np = D.createPerson(data); state.selected = np.id; toast('Человек добавлен'); }
    render();
  });
}
function openRelativeDialog(id) {
  const p = D.getPerson(id); if (!p) return;
  const kinds = Object.entries(D.REL_KINDS).map(([k, v]) => ({ k, label: v.label, ...D.canAddRelative(id, k) }));
  const d = openDialog(`<h2>Добавить родственника: ${esc(D.displayName(p))}</h2>
    <fieldset style="border:0;padding:0;margin:0"><legend class="hint">Кого добавить?</legend><div class="kinds">
    ${kinds.map((x) => `<label class="${x.ok ? '' : 'dis'}"><input type="radio" name="kind" value="${x.k}" ${x.ok ? '' : 'disabled'}> ${x.label}${x.ok ? '' : `<small>${esc(x.reason)}</small>`}</label>`).join('')}
    </div></fieldset>
    <fieldset style="border:0;padding:0;margin-top:12px"><legend class="hint">Кто это?</legend>
      <div class="check"><input type="radio" id="src-new" name="src" value="new" checked><label for="src-new">Новый человек</label></div>
      <div class="check"><input type="radio" id="src-old" name="src" value="old"><label for="src-old">Уже есть в списке (брату или сестре связь делается через общего родителя)</label></div></fieldset>
    <div class="foot"><button id="cancel">Отмена</button><button id="next" class="primary" disabled>Дальше</button></div>`);
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelectorAll('input[name=kind]').forEach((r) => (r.onchange = () => (d.querySelector('#next').disabled = false)));
  d.querySelector('#next').onclick = () => {
    const kind = d.querySelector('input[name=kind]:checked').value; const meta = D.REL_KINDS[kind];
    const isChild = kind === 'son' || kind === 'daughter';
    if (d.querySelector('input[name=src]:checked').value === 'old') return openLinkDialog(id, kind);
    const others = isChild ? D.spousesOf(id).map((s) => D.getPerson(s.id)).filter(Boolean) : null;
    const dd = openDialog(personForm(null, { title: `Новый(ая): ${meta.label.toLowerCase()} — ${D.displayName(p)}`, sex: meta.sex, marriage: kind === 'wife' || kind === 'husband', otherParents: others }));
    bindForm(dd, (data, other) => {
      const np = D.addRelative(id, kind, data, { otherParentId: other });
      state.selected = id; toast(`Добавлено: ${D.displayName(np)}`); render();
    }, meta.sex);
  };
}

function openLinkDialog(id, kind) {
  const p = D.getPerson(id); const meta = D.REL_KINDS[kind];
  const isChild = kind === 'son' || kind === 'daughter', isSpouse = kind === 'wife' || kind === 'husband';
  const cand = D.listPersons().filter((x) => x.id !== id && (x.sex === 'U' || x.sex === meta.sex));
  const others = isChild ? D.spousesOf(id).map((s) => D.getPerson(s.id)).filter(Boolean) : null;
  const d = openDialog(`<h2>Выбрать: ${esc(meta.label.toLowerCase())} — ${esc(D.displayName(p))}</h2>
    ${cand.length ? '' : '<p class="hint">Подходящих людей в списке нет.</p>'}
    <div class="field"><label for="l-who">Человек</label><select id="l-who"><option value="">— выберите —</option>${cand.map((x) => `<option value="${x.id}">${esc(D.displayName(x))}${D.lifeText(x) ? ' (' + esc(D.lifeText(x)) + ')' : ''}</option>`).join('')}</select></div>
    ${isSpouse ? `<div class="field"><label for="l-m">Дата брака</label><input id="l-m"></div>` : ''}
    ${others ? `<div class="field"><label for="l-op">Второй родитель</label><select id="l-op"><option value="">не указан</option>${others.map((o) => `<option value="${o.id}">${esc(D.displayName(o))}</option>`).join('')}</select></div>` : ''}
    <div id="form-err" role="alert" style="color:var(--color-danger)"></div>
    <div class="foot"><button id="cancel">Отмена</button><button id="go" class="primary">Связать</button></div>`);
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelector('#go').onclick = () => {
    const who = d.querySelector('#l-who').value; if (!who) { d.querySelector('#form-err').textContent = 'Выберите человека'; return; }
    try { D.linkRelative(id, kind, who, { marriage_text: d.querySelector('#l-m')?.value ?? '', otherParentId: d.querySelector('#l-op')?.value || null }); closeDialog(); state.selected = id; render(); restoreFocus(); toast('Связь добавлена'); }
    catch (e) { d.querySelector('#form-err').textContent = e.message; }
  };
}

// ---------- страница человека (S14) ----------
function renderPerson(m) {
  const p = state.selected && D.getPerson(state.selected);
  if (!p) { m.innerHTML = `<div class="empty"><p>Человек не найден.</p><a class="btn" href="#/persons">К списку</a></div>`; return; }
  const par = D.parentsOf(p.id), sp = D.spousesOf(p.id), ch = D.childrenOf(p.id), sib = D.siblingsOf(p.id);
  const nm = (id) => { const x = D.getPerson(id); return x ? `<button class="link" data-go="${id}">${esc(D.displayName(x))}</button>` : ''; };
  const childWord = (id) => ({ M: 'сын', F: 'дочь', U: 'ребёнок' }[D.getPerson(id)?.sex ?? 'U']);
  const line = (t) => {
    const when = t.when ? `<strong>${esc(t.when)}</strong>` : '<span class="hint">дата неизвестна</span>';
    const what = t.type === 'birth' ? 'Родился(ась)' : t.type === 'death' ? 'Умер(ла)' : t.type === 'marriage' ? `Брак: ${nm(t.otherId)}` : `Родился(ась) ${childWord(t.otherId)}: ${nm(t.otherId)}`;
    return `<li>${when} — ${what}</li>`;
  };
  const list = (ids) => (ids.length ? ids.map(nm).join(', ') : '<span class="hint">нет данных</span>');
  m.innerHTML = `
    <div class="toolbar"><a href="#/persons">← К списку</a>${PRINT ? '<button id="prn">Печать / PDF</button>' : ''}<a class="btn" href="#/tree/${p.id}" style="display:inline-flex;align-items:center;text-decoration:none">Показать на древе</a></div>
    <article class="panel" aria-label="Страница человека">
      <h2 style="font-size:var(--text-xl);line-height:var(--text-xl-line)">${esc(D.displayName(p))}</h2>
      ${p.maiden_name ? `<p class="hint">урождённая ${esc(p.maiden_name)}</p>` : ''}
      <dl>
        <dt>Годы жизни</dt><dd>${esc(D.lifeText(p)) || '<span class="hint">нет данных</span>'}${p.is_living ? ' (жив)' : ''}</dd>
        ${p.occupation ? `<dt>Занятие</dt><dd>${esc(p.occupation)}</dd>` : ''}
        <dt>Отец</dt><dd>${par.father ? nm(par.father) : '<span class="hint">нет данных</span>'}</dd>
        <dt>Мать</dt><dd>${par.mother ? nm(par.mother) : '<span class="hint">нет данных</span>'}</dd>
        <dt>Супруги</dt><dd>${list(sp.map((s) => s.id))}</dd>
        <dt>Дети</dt><dd>${list(ch)}</dd>
        <dt>Братья и сёстры</dt><dd>${list(sib)}</dd>
      </dl>
      ${p.comment ? `<h3>Заметки</h3><p style="white-space:pre-wrap">${esc(p.comment)}</p>` : ''}
      <h3>Хронология</h3>
      ${D.timeline(p.id).length ? `<ul>${D.timeline(p.id).map(line).join('')}</ul>` : '<p class="hint">Событий пока нет.</p>'}
    </article>`;
  $('#prn')?.addEventListener('click', () => window.print());
  m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.selected = b.dataset.go; location.hash = `#/person/${b.dataset.go}`; }));
}

// ---------- файлы: GEDCOM и резервная копия ----------
function download(name, text, mime) {
  if (globalThis.__NODOWNLOAD) return showText(name, text);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
// Запасной путь без скачивания: показать содержимое файла, чтобы скопировать его вручную.
function showText(name, text) {
  const d = openDialog(`<h2>${esc(name)}</h2><p class="hint">Скачивание в этом окне недоступно. Скопируйте текст и сохраните его в файл с этим именем.</p>
    <div class="field"><label for="t-out">Содержимое файла</label><textarea id="t-out" readonly rows="10"></textarea></div>
    <div class="foot"><button id="t-copy">Копировать</button><button id="t-close" class="primary">Закрыть</button></div>`);
  const ta = d.querySelector('#t-out'); ta.value = text;
  d.querySelector('#t-close').onclick = closeDialog;
  d.querySelector('#t-copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch { ta.focus(); ta.select(); toast('Выделено: нажмите Ctrl+C'); } };
}
const stamp = () => new Date().toISOString().slice(0, 10);
const MAX_FILE = 20 * 1024 * 1024;
function readFile(file) {
  return new Promise((ok, no) => {
    if (!file) return no(new Error('Выберите файл'));
    if (file.size > MAX_FILE) return no(new Error('Файл больше 20 МБ'));
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Не удалось прочитать файл')); r.readAsArrayBuffer(file);
  });
}
function openExportDialog() {
  const all = D.listPersons();
  const d = openDialog(`<h2>Экспорт в GEDCOM</h2>
    <p class="hint">Формат 5.5.1, кодировка UTF-8. Фото и документы пока не выгружаются.</p>
    <div class="field"><label for="x-priv">Выгружать записи с конфиденциальностью не выше: <output id="x-o">10</output></label><input id="x-priv" type="range" min="0" max="10" value="10"></div>
    <div class="check field"><input type="checkbox" id="x-live"><label for="x-live">Не выгружать живых</label></div>
    <p id="x-count" aria-live="polite"></p>
    <div class="foot"><button id="cancel">Отмена</button><button id="go" class="primary">Скачать</button></div>`);
  const opts = () => ({ maxPrivacy: +d.querySelector('#x-priv').value, excludeLiving: d.querySelector('#x-live').checked });
  const upd = () => { const o = opts(); const n = all.filter((p) => p.privacy_level <= o.maxPrivacy && !(o.excludeLiving && p.is_living)).length; d.querySelector('#x-o').textContent = o.maxPrivacy; d.querySelector('#x-count').textContent = `Будет выгружено ${n} из ${all.length}.`; };
  d.querySelector('#x-priv').oninput = upd; d.querySelector('#x-live').onchange = upd; upd();
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelector('#go').onclick = () => { download(`rodoslovnaya-${stamp()}.ged`, G.exportGedcom(opts()), 'text/plain;charset=utf-8'); closeDialog(); toast('Файл GEDCOM подготовлен'); };
}
function showReport(rep, enc) {
  const sk = Object.entries(rep.skipped);
  const d = openDialog(`<h2>Импорт завершён</h2>
    <ul><li>Людей: <strong>${rep.persons}</strong></li><li>Браков: <strong>${rep.marriages}</strong></li><li>Связей «родитель – ребёнок»: <strong>${rep.parentLinks}</strong></li>
    ${rep.unmarried ? `<li>Пар с детьми без отметки о браке: ${rep.unmarried} (браки не созданы, связи с детьми сохранены)</li>` : ''}
    ${rep.julian ? `<li>Дат по юлианскому календарю: ${rep.julian} (записаны как есть, без пересчёта)</li>` : ''}
    <li>Версия файла: ${esc(rep.version)}${enc ? `, кодировка: ${esc(enc)}` : ''}</li></ul>
    ${sk.length ? `<h3>Не перенесено (формат этой версии не поддерживает)</h3><ul>${sk.map(([k, n]) => `<li>${esc(k)}: ${n}</li>`).join('')}</ul>` : ''}
    ${rep.warnings.length ? `<h3>Предупреждения (${rep.warnings.length})</h3><ul>${rep.warnings.slice(0, 40).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>${rep.warnings.length > 40 ? '<p class="hint">Показаны первые 40.</p>' : ''}` : '<p>Предупреждений нет.</p>'}
    <div class="foot"><button id="ok" class="primary">Готово</button></div>`);
  d.querySelector('#ok').onclick = () => { closeDialog(); restoreFocus(); };
}
function openImportDialog() {
  const d = openDialog(`<h2>Импорт из GEDCOM</h2>
    <div class="field"><label for="i-file">Файл (.ged)</label><input id="i-file" type="file" accept=".ged,.gedcom,.txt"></div>
    <fieldset style="border:0;padding:0"><legend class="hint">Что сделать с текущими данными?</legend>
      <div class="check"><input type="radio" id="i-add" name="mode" value="add" checked><label for="i-add">Добавить людей из файла к существующим (дубли не ищутся)</label></div>
      <div class="check"><input type="radio" id="i-rep" name="mode" value="replace"><label for="i-rep">Заменить все данные содержимым файла</label></div></fieldset>
    <div id="form-err" role="alert" style="color:var(--color-danger)"></div>
    <div class="foot"><button id="cancel">Отмена</button><button id="go" class="primary">Импортировать</button></div>`);
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelector('#go').onclick = async () => {
    const err = d.querySelector('#form-err'); err.textContent = '';
    try {
      const buf = await readFile(d.querySelector('#i-file').files[0]);
      const { text, encoding } = G.decodeGedcom(new Uint8Array(buf));
      const mode = d.querySelector('input[name=mode]:checked').value;
      const run = (inDialog) => { try { const rep = G.importGedcom(text, { mode }); state.selected = null; render(); showReport(rep, encoding); } catch (e) { if (inDialog) err.textContent = e.message; else banner(e.message); } };
      if (mode === 'replace') confirmBox('Заменить все данные?', 'Текущие данные в этом браузере будут удалены. Сначала сделайте резервную копию, если они нужны.', () => run(false)); else run(true);   // ошибка внутри открытого диалога не должна уходить в плашку под ним
    } catch (e) { err.textContent = e.message; }
  };
}
function openBackupDialog() {
  const d = openDialog(`<h2>Резервная копия</h2>
    <p>Копия содержит все данные приложения в одном файле. Храните её в надёжном месте: в ней могут быть сведения о живых людях.</p>
    <div class="foot" style="justify-content:flex-start"><button id="save" class="primary">Скачать копию</button></div>
    <h3>Восстановить из копии</h3>
    <div class="field"><label for="b-file">Файл копии (.json)</label><input id="b-file" type="file" accept=".json,application/json"></div>
    <div id="form-err" role="alert" style="color:var(--color-danger)"></div>
    <div class="foot"><button id="cancel">Закрыть</button><button id="restore" class="danger">Восстановить</button></div>`);
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelector('#save').onclick = () => { download(`rodoslovnaya-backup-${stamp()}.json`, D.exportBackup(), 'application/json'); toast('Копия подготовлена'); };
  d.querySelector('#restore').onclick = async () => {
    const err = d.querySelector('#form-err'); err.textContent = '';
    try {
      const buf = await readFile(d.querySelector('#b-file').files[0]);
      const text = new TextDecoder('utf-8').decode(buf);
      confirmBox('Заменить данные копией?', 'Текущие данные в этом браузере будут заменены содержимым файла.', () => { try { const r = D.importBackup(text); state.selected = null; render(); toast(`Восстановлено людей: ${r.persons}`); } catch (e) { banner(e.message); } });
    } catch (e) { err.textContent = e.message; }
  };
}

window.addEventListener('hashchange', render);
window.addEventListener('storage', (e) => { if (!$('#dlg').open && (e.key === null || e.key.startsWith('rodoslovnaya'))) guard(render); });   // BUG-001: подхватываем правки из другой вкладки
guard(render);
if (D.storageMode() === 'memory') banner('Память браузера недоступна (возможно, приватный режим): данные будут жить, пока открыта эта вкладка, и пропадут после закрытия.');
