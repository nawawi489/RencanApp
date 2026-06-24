// Headless Chrome screenshotter via raw DevTools Protocol (no deps).
// Loads design.html, drives showScreen() per screen, saves full-page PNGs to ui/ux/.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:4599/design.html';
const OUT = path.join(process.cwd(), 'ui', 'ux');
const PORT = 9222;
const W = 430;

const SCREENS = [
  'home','notifications','workspace','performance-workspace','development-workspace',
  'development-area-detail','new-development-area','new-problem','problem-detail','goal-detail',
  'new-goal','new-kpi-area','new-strategy','new-initiative','kpi-detail','strategy-detail',
  'initiative-detail','action-plan-detail','new-action-plan','repeat-setting','evidence-submission',
  'result-value-input','action-plan-instance-detail','review-flow','deadline-request','card-completeness',
  'evaluation-flow','inbox','inbox-chat','menu','people','people-ranking','people-profile',
  'score-settings','permission-settings','repeat-rule-settings','goal-template-library',
  'kpi-template-library','organization-settings','rules-settings','activity-log','governance-violation',
  'archive-view','global-search','confidential-access','manual-score-override'
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitForDevtools() {
  for (let i = 0; i < 40; i++) {
    try { const v = await getJSON('/json/version'); if (v.webSocketDebuggerUrl) return v; } catch (e) {}
    await sleep(500);
  }
  throw new Error('DevTools endpoint not ready');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, { resolve, reject });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const userDir = path.join(process.env.TEMP || '.', 'cdp-shoot-profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    `--window-size=${W},932`,
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--no-first-run',
    '--no-default-browser-check',
    URL,
  ], { stdio: 'ignore' });

  try {
    await waitForDevtools();
    let targets = await getJSON('/json');
    let page = targets.find(t => t.type === 'page');
    if (!page) { const n = await getJSON('/json/new?' + encodeURIComponent(URL)); page = n; }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = cdp(ws);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: 932, deviceScaleFactor: 2, mobile: true,
    });
    await send('Page.navigate', { url: URL });
    await sleep(1500);

    const shoot = async (idx, name, expr) => {
      await send('Runtime.evaluate', { expression: expr });
      await sleep(450);
      // Full content size
      const metrics = await send('Page.getLayoutMetrics');
      const cs = metrics.cssContentSize || metrics.contentSize;
      const height = Math.min(Math.ceil(cs.height), 20000);
      const cap = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: W, height, scale: 2 },
      });
      const file = path.join(OUT, String(idx).padStart(2, '0') + '-' + name + '.png');
      fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
      console.log('saved', path.basename(file), height + 'px');
    };

    // 00 login (logged out)
    await shoot(0, 'login', "showScreen('login');");
    // each authenticated screen
    for (let i = 0; i < SCREENS.length; i++) {
      await shoot(i + 1, SCREENS[i], `showScreen('${SCREENS[i]}'); window.scrollTo(0,0);`);
    }

    ws.close();
    console.log('DONE total', SCREENS.length + 1);
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
