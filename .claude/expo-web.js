// Launcher untuk preview harness: Expo CLI tidak membaca env PORT untuk dev server,
// jadi teruskan port yang di-assign harness sebagai flag --port eksplisit.
const { spawn } = require('child_process');
const path = require('path');

const port = process.env.PORT || '8091';
const child = spawn('npx', ['expo', 'start', '--web', '--port', port], {
  cwd: path.join(__dirname, '..', 'mobile'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
