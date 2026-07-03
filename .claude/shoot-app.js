// Headless Chrome screenshotter untuk semua route Expo web (zero deps).
// Prasyarat: server Expo jalan di http://127.0.0.1:8091 dengan EXPO_PUBLIC_UI_MODE=prototype
// dan Supabase lokal di 54321 (user ceo@rencan.local / rencan123).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://127.0.0.1:8091';
const OUT = path.join(process.cwd(), 'ui', 'screenshots', '2026-07-02');
const PORT = 9225;
const W = 430;
const H = 932;

// Setiap entri: [filename, route]. Route adalah path Expo Router (tanpa prefiks group).
// Demo ID dipakai untuk [id] routes — prototype fixtures abaikan nilainya.
const ROUTES = [
  ['00-login',                 '/login'],
  ['01-home',                  '/'],
  ['02-notifications',         '/notifications'],
  ['03-workspace',             '/workspace'],
  ['04-inbox',                 '/inbox'],
  ['05-menu',                  '/menu'],
  ['06-people',                '/people'],
  ['07-people-ranking',        '/people-ranking'],
  ['08-people-profile',        '/people-profile/demo-user'],
  ['09-search',                '/search'],
  ['10-settings',              '/settings'],
  ['11-settings-org-structure','/settings-org-structure'],
  ['12-settings-activity-log', '/settings-activity-log'],
  ['13-settings-governance-violation','/settings-governance-violation'],
  ['14-settings-confidential-access','/settings-confidential-access'],
  ['15-settings-card-completion-rule','/settings-card-completion-rule'],
  ['16-settings-card-guidance','/settings-card-guidance'],
  ['17-settings-status-priority','/settings-status-priority'],
  ['18-settings-notifications-rule','/settings-notifications-rule'],
  ['19-settings-repeat-rules', '/settings-repeat-rules'],
  ['20-settings-archive',      '/settings-archive'],
  ['21-settings-goal-templates','/settings-goal-templates'],
  ['22-settings-permission-users','/settings-permission-users'],
  ['23-settings-kpi-area-templates','/settings-kpi-area-templates'],
  ['24-settings-mbr',          '/settings-mbr'],
  ['25-settings-score-formula','/settings-score-formula'],
  ['26-action-plan-new',       '/action-plan/new'],
  ['27-action-plan-detail',    '/action-plan/demo-id'],
  ['28-action-plan-instance',  '/action-plan/instance/demo-id'],
  ['29-action-plan-submit',    '/action-plan/submit'],
  ['30-goal-wizard',           '/goal-wizard'],
  ['31-goal-new',              '/goal/new'],
  ['32-goal-detail',           '/goal/demo-id'],
  ['33-kpi-area-new',          '/kpi-area/new'],
  ['34-kpi-area-detail',       '/kpi-area/demo-id'],
  ['35-strategy-new',          '/strategy/new'],
  ['36-strategy-detail',       '/strategy/demo-id'],
  ['37-initiative-new',        '/initiative/new'],
  ['38-initiative-detail',     '/initiative/demo-id'],
  ['39-development-area-new',  '/development-area/new'],
  ['40-development-area-detail','/development-area/demo-id'],
  ['41-problem-statement-new', '/problem-statement/new'],
  ['42-problem-statement-detail','/problem-statement/demo-id'],
  ['43-manual-score-override', '/manual-score-override'],
  ['44-deadline-change-request','/deadline-change-request'],
  ['45-cancellation',          '/cancellation'],
  ['46-evaluation',            '/evaluation'],
  ['47-inbox-room',            '/inbox/demo-room'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(p) {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}${p}`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function waitDt() {
  for (let i = 0; i < 60; i++) {
    try { const v = await getJSON('/json/version'); if (v.webSocketDebuggerUrl) return; } catch (e) {}
    await sleep(500);
  }
  throw new Error('Chrome DevTools tidak siap');
}

function cdp(ws) {
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { resolve, reject } = pend.get(m.id);
      pend.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const my = ++id;
    pend.set(my, { resolve, reject });
    ws.send(JSON.stringify({ id: my, method, params }));
  });
}

async function signIn(send) {
  await sleep(2500);
  const fill = `
    (function() {
      const inputs = document.querySelectorAll('input');
      if (inputs.length < 2) return 'no_inputs:' + inputs.length;
      const setVal = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setVal(inputs[0], 'ceo@rencan.local');
      setVal(inputs[1], 'rencan123');
      return 'filled:' + inputs.length;
    })();
  `;
  const r1 = await send('Runtime.evaluate', { expression: fill, returnByValue: true });
  console.log('  fill:', r1.result.value);
  await sleep(400);
  const click = `
    (function() {
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        const t = (b.textContent || '').trim();
        if (t === 'Masuk') { b.click(); return 'clicked'; }
      }
      return 'no_btn:' + document.querySelectorAll('button').length;
    })();
  `;
  const r2 = await send('Runtime.evaluate', { expression: click, returnByValue: true });
  console.log('  click:', r2.result.value);
  await sleep(5000);
}

async function waitForRender(send, maxSec = 75) {
  // Tunggu sampai ada teks baru yang loaded di root innerText (>60 char) dan berbeda dari loading.
  const expr = `
    (async () => {
      const start = Date.now();
      while (Date.now() - start < ${maxSec * 1000}) {
        const r = document.getElementById('root');
        if (r && r.innerText && r.innerText.length > 60) {
          return { ready: true, waitMs: Date.now() - start, snippet: r.innerText.slice(0, 100) };
        }
        await new Promise(s => setTimeout(s, 400));
      }
      return { ready: false, url: location.href };
    })()
  `;
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result.value;
}

async function shoot(send, name, route) {
  const url = APP_URL + route;
  await send('Page.navigate', { url });
  const r = await waitForRender(send, 90);
  if (!r.ready) {
    console.log('TIMEOUT', name, route);
  } else {
    console.log('loaded', name, 'in', r.waitMs + 'ms', '|', r.snippet.replace(/\n/g, ' ').slice(0, 60));
  }
  await sleep(700); // settle animasi/layout
  // Capture viewport (mobile 430x932, scale 2x) — fullPage tidak dipakai karena
  // mobile UI wajib pas di viewport dan chrome devtools fullPage bermasalah.
  const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 2 } });
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
  console.log('saved', name + '.png');
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const userDir = path.join(process.env.TEMP || '.', 'cdp-shoot-ems2');
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDir}`,
      `--window-size=${W},${H}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--no-first-run',
      '--no-default-browser-check',
      APP_URL + '/login',
    ],
    { stdio: 'ignore' },
  );
  try {
    await waitDt();
    const page = (await getJSON('/json')).find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = cdp(ws);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 2, mobile: true,
    });
    // Tunggu Metro bundle selesai untuk halaman login (bisa 60-120s saat cold start).
    await send('Page.navigate', { url: APP_URL + '/login' });
    await waitForRender(send, 180);

    // 00-login (logged out)
    {
      const cap = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 2 } });
      fs.writeFileSync(path.join(OUT, '00-login.png'), Buffer.from(cap.data, 'base64'));
      console.log('saved 00-login.png');
    }

    console.log('signing in...');
    await signIn(send);
    // Tunggu navigasi pasca sign-in.
    await waitForRender(send, 45);

    for (let i = 1; i < ROUTES.length; i++) {
      const [name, route] = ROUTES[i];
      try {
        await shoot(send, name, route);
      } catch (e) {
        console.log('FAIL', name, e.message);
      }
    }
    ws.close();
    console.log('DONE total', ROUTES.length);
  } finally {
    chrome.kill();
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
