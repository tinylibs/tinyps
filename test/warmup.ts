import { listProcesses } from '../src/main.js';

/**
 * The first call on a given machine pays the startup cost of the underlying
 * `ps`/`powershell` process.
 */
export async function setup(): Promise<void> {
  await listProcesses();
}
