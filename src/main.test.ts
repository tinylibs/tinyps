import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { basename, extname } from 'node:path';
import {
  findProcessesByName,
  findProcessesByPort,
  getDescendants,
  getProcessInfo,
  getProcessTree,
  isRunning,
  killTree,
  listProcesses,
} from './main.js';

const parentFixture = fileURLToPath(
  new URL('../test/fixtures/parent.js', import.meta.url),
);

const listenerFixture = fileURLToPath(
  new URL('../test/fixtures/listener.js', import.meta.url),
);

const clientFixture = fileURLToPath(
  new URL('../test/fixtures/client.js', import.meta.url),
);

const execName = basename(process.execPath, extname(process.execPath));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawns a process which itself spawns a single child, and resolves once
 * both are running.
 */
function spawnTree(): Promise<{ parent: ChildProcess; childPid: number }> {
  return new Promise((resolve, reject) => {
    const parent = spawn(process.execPath, [parentFixture]);
    parent.on('error', reject);
    parent.stdout.once('data', (data) => {
      resolve({ parent, childPid: Number(String(data).trim()) });
    });
  });
}

function killTreeSync(parent: ChildProcess, childPid: number): void {
  parent.kill('SIGKILL');
  if (isAlive(childPid)) {
    process.kill(childPid, 'SIGKILL');
  }
}

function spawnListener(): Promise<{ child: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [listenerFixture]);
    child.on('error', reject);
    child.stdout.once('data', (data) => {
      resolve({ child, port: Number(String(data).trim()) });
    });
  });
}

function spawnClient(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [clientFixture, String(port)]);
    child.on('error', reject);
    child.stdout.once('data', () => resolve(child));
  });
}

function getUnusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

describe('getProcessTree', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('includes the given pid', async () => {
    const tree = await getProcessTree(parent.pid!);

    expect(tree.has(parent.pid!)).toBe(true);
  });

  it('includes descendants of the given pid', async () => {
    const tree = await getProcessTree(parent.pid!);

    expect(tree.get(parent.pid!)).toContain(childPid);
    expect(tree.has(childPid)).toBe(true);
  });

  it('excludes processes outside the tree', async () => {
    const tree = await getProcessTree(childPid);

    expect([...tree.keys()]).toEqual([childPid]);
  });

  it('produces an empty child list for a leaf process', async () => {
    const tree = await getProcessTree(childPid);

    expect(tree.get(childPid)).toEqual([]);
  });

  it('produces an empty tree for an unknown pid', async () => {
    killTreeSync(parent, childPid);
    await vi.waitFor(() => {
      expect(isAlive(parent.pid!)).toBe(false);
    });

    expect(await getProcessTree(parent.pid!)).toEqual(new Map());
  });
});

describe('killTree', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('kills the given process and its descendants', async () => {
    await killTree(parent.pid!);

    await vi.waitFor(() => {
      expect(isAlive(parent.pid!)).toBe(false);
      expect(isAlive(childPid)).toBe(false);
    });
  });

  it('kills with the given signal', async () => {
    const exited = new Promise<NodeJS.Signals | null>((resolve) => {
      parent.on('exit', (_code, signal) => resolve(signal));
    });

    await killTree(parent.pid!, 'SIGKILL');

    // windows has no signals, so processes are terminated without one
    expect(await exited).toBe(process.platform === 'win32' ? null : 'SIGKILL');
  });

  it('leaves processes outside the tree running', async () => {
    await killTree(childPid);

    await vi.waitFor(() => {
      expect(isAlive(childPid)).toBe(false);
    });
    expect(isAlive(parent.pid!)).toBe(true);
  });

  it('throws for a non-positive pid', async () => {
    await expect(killTree(0)).rejects.toThrow(TypeError);
    await expect(killTree(-1)).rejects.toThrow(TypeError);
  });

  it('ignores processes which no longer exist', async () => {
    killTreeSync(parent, childPid);
    await vi.waitFor(() => {
      expect(isAlive(parent.pid!)).toBe(false);
    });

    await expect(killTree(parent.pid!)).resolves.toBeUndefined();
  });
});

describe('isRunning', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('returns true for a running process', () => {
    expect(isRunning(parent.pid!)).toBe(true);
  });

  it('returns false for a process which has exited', async () => {
    killTreeSync(parent, childPid);
    await vi.waitFor(() => {
      expect(isAlive(parent.pid!)).toBe(false);
    });

    expect(isRunning(parent.pid!)).toBe(false);
  });

  it('returns false for a non-positive pid', () => {
    expect(isRunning(0)).toBe(false);
    expect(isRunning(-1)).toBe(false);
  });
});

describe('getDescendants', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('resolves the descendants of the given pid', async () => {
    expect(await getDescendants(parent.pid!)).toEqual([childPid]);
  });

  it('resolves an empty list for a leaf process', async () => {
    expect(await getDescendants(childPid)).toEqual([]);
  });

  it('resolves an empty list for an unknown pid', async () => {
    expect(await getDescendants(-1)).toEqual([]);
  });
});

describe('listProcesses', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('includes running processes', async () => {
    const processes = await listProcesses();

    expect(processes.map((proc) => proc.pid)).toContain(childPid);
  });

  it('resolves the parent of each process', async () => {
    const processes = await listProcesses();

    expect(processes.find((proc) => proc.pid === childPid)!.ppid).toBe(
      parent.pid,
    );
  });

  it('resolves the name and command of each process', async () => {
    const processes = await listProcesses();
    const child = processes.find((proc) => proc.pid === childPid)!;

    expect(child.name).toBe(execName);
    expect(child.command).toContain('idle.js');
  });
});

describe('getProcessInfo', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('resolves the info of the given process', async () => {
    const info = (await getProcessInfo(childPid))!;

    expect(info.pid).toBe(childPid);
    expect(info.ppid).toBe(parent.pid);
    expect(info.command).toContain('idle.js');
  });

  it('resolves undefined for an unknown pid', async () => {
    expect(await getProcessInfo(-1)).toBeUndefined();
  });
});

describe('findProcessesByPort', () => {
  let child: ChildProcess;
  let port: number;

  beforeEach(async () => {
    ({ child, port } = await spawnListener());
  });

  afterEach(() => {
    child.kill('SIGKILL');
  });

  it('resolves the process bound to the given port', async () => {
    const processes = await findProcessesByPort(port);

    expect(processes.map((proc) => proc.pid)).toContain(child.pid);
  });

  it('resolves the info of the process bound to the given port', async () => {
    const [proc] = await findProcessesByPort(port);

    expect(proc!.name).toBe(execName);
    expect(proc!.command).toContain('listener.js');
  });

  it('resolves an empty list when nothing is bound to the port', async () => {
    expect(await findProcessesByPort(await getUnusedPort())).toEqual([]);
  });

  it('resolves an empty list when the protocol does not match', async () => {
    expect(await findProcessesByPort(port, { protocol: 'udp' })).toEqual([]);
  });

  it('resolves the process when the protocol matches', async () => {
    const processes = await findProcessesByPort(port, { protocol: 'tcp' });

    expect(processes.map((proc) => proc.pid)).toContain(child.pid);
  });

  it('ignores processes connected to the port remotely', async () => {
    const client = await spawnClient(port);

    try {
      const processes = await findProcessesByPort(port);

      expect(processes.map((proc) => proc.pid)).not.toContain(client.pid);
    } finally {
      client.kill('SIGKILL');
    }
  });
});

describe('findProcessesByName', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('resolves processes with the given name', async () => {
    const processes = await findProcessesByName(execName);

    expect(processes.map((proc) => proc.pid)).toContain(childPid);
  });

  it('resolves an empty list when nothing matches', async () => {
    expect(await findProcessesByName('definitely-not-a-process')).toEqual([]);
  });

  it('ignores partial matches by default', async () => {
    const processes = await findProcessesByName(execName.slice(1));

    expect(processes).toEqual([]);
  });

  it('matches partial names when loose', async () => {
    const processes = await findProcessesByName(execName.slice(1), {
      loose: true,
    });

    expect(processes.map((proc) => proc.pid)).toContain(childPid);
  });

  it('ignores case when loose', async () => {
    const processes = await findProcessesByName(execName.toUpperCase(), {
      loose: true,
    });

    expect(processes.map((proc) => proc.pid)).toContain(childPid);
  });
});
