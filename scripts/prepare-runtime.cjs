const fs = require('node:fs/promises');
require('node:child_process').execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { stdio: 'inherit' });
(async () => {
  await fs.cp('public', '.next/standalone/public', { recursive: true });
  await fs.mkdir('.next/standalone/.next', { recursive: true });
  await fs.cp('.next/static', '.next/standalone/.next/static', { recursive: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
