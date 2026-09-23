import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, [
  fileURLToPath(new URL('./child.js', import.meta.url)),
]);

// the child writes the pid of its own child, giving us a three level tree
child.stdout.once('data', (data) => {
  process.stdout.write(`${child.pid} ${String(data).trim()}\n`);
});

setInterval(() => {}, 1000);
