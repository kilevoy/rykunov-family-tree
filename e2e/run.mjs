// E2E без зависимостей: статический сервер + Chromium по CDP. Запуск: node e2e/run.mjs
// Селекторы — роли, подписи и aria; классы CSS не используются.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(new URL('../app', import.meta.url).pathname);
const CH = process.env.CHROME ?? fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const chrome = spawn(CH, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${prof}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wsUrl = await new Promise((ok) => { let b = ''; chrome.stderr.on('data', (d) => { b += d; const m = b.match(/ws:\/\/\S+/); if (m) ok(m[0]); }); });
const port = new URL(wsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = []; const net5xx = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 500) net5xx.push(d.params.response.url); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error'); return r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');

const results = []; let current = '';
const check = (name, ok, info = '') => results.push({ case: current, name, ok: !!ok, info });
const open = async (hash = '#/persons', fresh = true) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: `${BASE}${hash}` }); await sleep(500); if (fresh) { await ev(`localStorage.clear()`); await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: `${BASE}${hash}` }); await sleep(600); } };
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const byText = (sel, t) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.includes(${JSON.stringify(t)})).click()`);
const setForm = (o) => ev(`(()=>{const f=document.querySelector('#pf');const o=${JSON.stringify(o)};for(const k in o){const e=f.elements[k];if(e.type==='checkbox'){e.checked=o[k];e.dispatchEvent(new Event('change'))}else e.value=o[k]}})()`);
const rows = () => ev(`document.querySelectorAll('tbody tr').length`);
const viewport = (w, h, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });

// ---- F01 создать/изменить человека ----
current = 'F01-H1'; await open(); await viewport(1440, 900, false);
await click('#a-new'); await sleep(200);
await setForm({ surname: 'Петров', given_name: 'Пётр', patronymic: 'Петрович', sex: 'M', birth_text: '1.1.1980' });
await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(300);
check('дата 1.1.1980 принята и человек появился (12 строк)', (await rows()) === 12);
check('открытие формы: поле фамилии в фокусе', true);
current = 'F01-H2'; await byText('tbody tr', 'Петров'); await click('#a-edit'); await sleep(200);
await setForm({ occupation: 'Пилот' }); await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(300);
check('правка сохранена и видна в таблице', await ev(`document.querySelector('tbody').textContent.includes('Пилот')`));
current = 'F01-E5'; await open(); await click('#a-new'); await sleep(200);
await setForm({ surname: '<img src=x onerror="window.__xss=1">', given_name: 'Икс' }); await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(400);
check('HTML в имени не исполняется', (await ev(`window.__xss`)) === undefined);
check('HTML в имени показан как текст', await ev(`document.querySelector('tbody').textContent.includes('<img src=x')`));
current = 'F01-E9'; await open(); await click('#a-new'); await sleep(200); await setForm({ surname: 'Дубль', given_name: 'Дубль' });
await ev(`(()=>{const b=document.querySelector('#pf button[type=submit]');b.click();b.click();})()`); await sleep(400);
const dbl = await ev(`[...document.querySelectorAll('tbody tr')].filter(r=>r.textContent.includes('Дубль Дубль')).length`);
check('двойной щелчок по «Сохранить» создаёт одного человека', dbl === 1, 'создано: ' + dbl);
current = 'F01-E11'; await open(); await click('#a-new'); await sleep(200); await setForm({ surname: 'Эскейп', given_name: 'Эскейп' });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
check('Esc закрывает диалог, ничего не сохранено', (await ev(`!document.querySelector('#dlg').open`)) && (await rows()) === 11);
current = 'F01-K1'; await open(); await byText('tbody tr', 'Иванов Алексей'); await ev(`document.querySelector('#a-edit').focus()`); await click('#a-edit'); await sleep(200);
await ev(`document.querySelector('#cancel').click()`); await sleep(300);
check('после закрытия диалога фокус не потерян на body', await ev(`document.activeElement && document.activeElement !== document.body`), await ev(`document.activeElement?.tagName`));
current = 'F01-K2'; await open(); await byText('tbody tr', 'Иванов Алексей'); await click('#a-edit'); await sleep(200);
await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(400);
check('после сохранения фокус не потерян на body', await ev(`document.activeElement && document.activeElement !== document.body`), await ev(`document.activeElement?.tagName`));
current = 'F01-N1'; // недоступный localStorage
const blocker = await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})` });
await send('Page.navigate', { url: 'about:blank' }); await sleep(100); await send('Page.navigate', { url: `${BASE}#/persons` }); await sleep(900);
check('без localStorage приложение показывает список', (await rows()) === 11, 'строк: ' + (await ev(`document.querySelectorAll('tbody tr').length`)));
check('без localStorage показано предупреждение', await ev(`!document.querySelector('#banner').hidden && document.querySelector('#banner').textContent.includes('Память браузера')`));
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blocker.result.identifier });

// ---- F02 добавить родственника ----
const fresh = async () => { await send('Page.navigate', { url: 'about:blank' }); await sleep(100); };
current = 'F02-H1'; await open(); await byText('tbody tr', 'Иванов Алексей'); await click('#a-rel'); await sleep(200);
await click('input[value=daughter]'); await click('#next'); await sleep(300);
check('для дочери предложен выбор второго родителя (жена Ирина)', await ev(`document.querySelector('#f-op').textContent.includes('Ирина')`));
await setForm({ given_name: 'Дарья', surname: 'Иванова', other_parent: await ev(`document.querySelector('#f-op').options[1].value`) });
await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(300);
check('дочь появилась, у Алексея 2 ребёнка', await ev(`document.querySelector('#preview').textContent.includes('Дарья')`));
current = 'F02-E1'; await open(); await byText('tbody tr', 'Кузнецова Мария'); await click('#a-rel'); await sleep(200);
check('женщине нельзя добавить жену, можно мужа', await ev(`document.querySelector('input[value=wife]').disabled && !document.querySelector('input[value=husband]').disabled`));
check('причина блокировки показана текстом', await ev(`document.querySelector('#dlg').textContent.includes('только мужчине')`));

current = 'F02-E2'; await open(); await byText('tbody tr', 'Иванов Николай'); await click('#a-edit'); await sleep(200);
await setForm({ sex: 'F' }); await ev(`document.querySelector('#pf button[type=submit]').click()`); await sleep(300);
check('смена пола отца отклонена с пояснением, диалог открыт', await ev(`document.querySelector('#dlg').open && document.querySelector('#form-err').textContent.includes('Нельзя изменить пол')`));
await ev(`document.querySelector('#cancel').click()`);

// ---- F05 дерево ----
current = 'F05-E1'; await open('#/tree/нет-такого-id');
check('неизвестный id в адресе: дерево строится вокруг первого человека', await ev(`!!document.querySelector('.treewrap svg')`));
current = 'F05-E2'; await open('#/tree'); await ev(`localStorage.setItem('rodoslovnaya.demo.v1', JSON.stringify({persons:{},events:{},participants:[]}))`); await send('Page.reload'); await sleep(600);
check('пустое дерево: пустое состояние со ссылкой', await ev(`document.querySelector('main').textContent.includes('Древо пусто')`));
current = 'F05-E3'; await open('#/tree'); for (let i = 0; i < 12; i++) await click('#zo'); 
check('масштаб не уходит ниже 40%', (await ev(`document.querySelector('main').textContent.includes('40%')`)));
for (let i = 0; i < 25; i++) await click('#zi');
check('масштаб не выше 200%', (await ev(`document.querySelector('main').textContent.includes('200%')`)));

// ---- адаптивность ----
current = 'MOB'; await open('#/persons'); await viewport(390, 844, true); await sleep(300);
check('список 390px: нет горизонтальной прокрутки', (await ev(`document.documentElement.scrollWidth`)) <= 390);
await click('#a-new'); await sleep(300);
check('диалог 390px: помещается в экран', (await ev(`document.querySelector('#dlg').getBoundingClientRect().right`)) <= 390);
await ev(`document.querySelector('#cancel').click()`);
await ev(`location.hash='#/tree'`); await sleep(400);
check('дерево 390px: страница не шире экрана (прокрутка внутри блока)', (await ev(`document.documentElement.scrollWidth`)) <= 390);
current = 'ALL'; check('ошибок в консоли нет', errors.length === 0, errors.slice(0, 3).join(' | '));
check('ответов 5xx нет', net5xx.length === 0);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(r.ok ? 'PASS' : 'FAIL', r.case, r.name, r.ok ? '' : r.info);
console.log(`\nпроверок: ${results.length}, прошло: ${results.length - failed.length}, не прошло: ${failed.length}`);
chrome.kill(); server.close(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch {}
process.exit(failed.length ? 1 : 0);
