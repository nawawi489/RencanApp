// Screenshot the improved-pattern frames via raw DevTools Protocol (no deps).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///D:/Projects/RencanApp/ui/ux/improved/design-improved.html';
const OUT = path.join(process.cwd(), 'ui', 'ux', 'improved');
const PORT = 9223;
const W = 430;

const FRAMES = [
  'empty-governance', 'search-initial', 'search-zero', 'loading-skeleton', 'people-legend',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function getJSON(p) {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}${p}`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}
async function waitDt() { for (let i = 0; i < 40; i++) { try { const v = await getJSON('/json/version'); if (v.webSocketDebuggerUrl) return; } catch (e) {} await sleep(500); } throw new Error('no devtools'); }
function cdp(ws) {
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } });
  return (method, params = {}) => new Promise((resolve, reject) => { const my = ++id; pend.set(my, { resolve, reject }); ws.send(JSON.stringify({ id: my, method, params })); });
}
async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const userDir = path.join(process.env.TEMP || '.', 'cdp-shoot2');
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, `--window-size=${W},932`, '--hide-scrollbars', '--force-device-scale-factor=2', '--no-first-run', '--no-default-browser-check', URL], { stdio: 'ignore' });
  try {
    await waitDt();
    const targets = await getJSON('/json');
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = cdp(ws);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL });
    await sleep(1400);
    for (let i = 0; i < FRAMES.length; i++) {
      await send('Runtime.evaluate', { expression: `showFrame('${FRAMES[i]}'); window.scrollTo(0,0);` });
      await sleep(500);
      const m = await send('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      const height = Math.max(932, Math.min(Math.ceil(cs.height), 20000));
      const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height, scale: 2 } });
      const file = path.join(OUT, String(i + 1).padStart(2, '0') + '-' + FRAMES[i] + '.png');
      fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
      console.log('saved', path.basename(file), height + 'px');
    }
    ws.close();
    console.log('DONE');
  } finally { chrome.kill(); }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
