import { listProcesses } from '../src/main.js';

/**
 * The first call on a given machine pays the startup cost of the underlying
 * `ps`/`powershell` process (several seconds on windows, where the WMI service
 * must also initialise). Doing it once up front keeps that cost out of the
 * individual tests.
 */
export async function setup(): Promise<void> {
  await listProcesses();
}
