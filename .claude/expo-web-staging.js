const { spawn } = require('child_process');
const path = require('path');

const port = process.env.PORT || '8092';
const child = spawn(
  'npx',
  ['dotenv', '-e', '.env.staging', '--', 'expo', 'start', '--web', '--port', port],
  {
    cwd: path.join(__dirname, '..', 'mobile'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
