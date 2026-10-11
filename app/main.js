import * as D from './data.js';
import { relationName } from './kinship.js';
import { layoutTree, CARD } from './tree.js';

const $ = (s) => document.querySelector(s);
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
    <button id="a-reset" class="ghost">Сбросить тестовые данные</button>`;
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
      <button id="zo" aria-label="Уменьшить">−</button><span aria-live="polite">${Math.round(z * 100)}%</span><button id="zi" aria-label="Увеличить">+</button><button id="z1">100%</button></div>
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
}

// ---------- диалоги ----------
function openDialog(html) { const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal(); return d; }
const closeDialog = () => $('#dlg').close();

function confirmBox(title, text, onYes) {
  const d = openDialog(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="foot"><button id="no">Отмена</button><button id="yes" class="danger">Подтвердить</button></div>`);
  d.querySelector('#no').onclick = closeDialog; d.querySelector('#yes').onclick = () => { closeDialog(); onYes(); };
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
    const data = {
      surname: f.surname.value, given_name: f.given_name.value, patronymic: f.patronymic.value, maiden_name: f.maiden_name.value,
      sex: sexFixed ?? f.sex.value, is_living: f.is_living.checked, birth_text: f.birth_text.value, death_text: f.is_living.checked ? '' : f.death_text.value,
      occupation: f.occupation.value, comment: f.comment.value, privacy_level: +f.privacy_level.value,
    };
    if (f.marriage_text) data.marriage_text = f.marriage_text.value;
    try { onSubmit(data, f.other_parent?.value || null); closeDialog(); } catch (err) { d.querySelector('#form-err').textContent = err.message; }
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
    </div></fieldset><div class="foot"><button id="cancel">Отмена</button><button id="next" class="primary" disabled>Дальше</button></div>`);
  d.querySelector('#cancel').onclick = closeDialog;
  d.querySelectorAll('input[name=kind]').forEach((r) => (r.onchange = () => (d.querySelector('#next').disabled = false)));
  d.querySelector('#next').onclick = () => {
    const kind = d.querySelector('input[name=kind]:checked').value; const meta = D.REL_KINDS[kind];
    const isChild = kind === 'son' || kind === 'daughter';
    const others = isChild ? D.spousesOf(id).map((s) => D.getPerson(s.id)).filter(Boolean) : null;
    const dd = openDialog(personForm(null, { title: `Новый(ая): ${meta.label.toLowerCase()} — ${D.displayName(p)}`, sex: meta.sex, marriage: kind === 'wife' || kind === 'husband', otherParents: others }));
    bindForm(dd, (data, other) => {
      const np = D.addRelative(id, kind, data, { otherParentId: other });
      state.selected = id; toast(`Добавлено: ${D.displayName(np)}`); render();
    }, meta.sex);
  };
}

window.addEventListener('hashchange', render);
guard(render);
