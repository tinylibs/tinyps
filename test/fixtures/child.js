import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, [
  fileURLToPath(new URL('./idle.js', import.meta.url)),
]);

process.stdout.write(`${child.pid}\n`);

setInterval(() => {}, 1000);
