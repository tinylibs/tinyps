import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getProcessTree, killTree } from './main.js';

const parentFixture = fileURLToPath(
  new URL('../test/fixtures/parent.js', import.meta.url),
);

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

describe('getProcessTree', () => {
  let parent: ChildProcess;
  let childPid: number;

  beforeEach(async () => {
    ({ parent, childPid } = await spawnTree());
  });

  afterEach(() => {
    killTreeSync(parent, childPid);
  });

  it('roots the tree at the given pid', async () => {
    const tree = await getProcessTree(parent.pid!);

    expect(tree.root).toBe(parent.pid);
  });

  it('includes descendants of the given pid', async () => {
    const tree = await getProcessTree(parent.pid!);

    expect(tree.tree.get(parent.pid!)).toContain(childPid);
    expect(tree.tree.has(childPid)).toBe(true);
  });

  it('excludes processes outside the tree', async () => {
    const tree = await getProcessTree(childPid);

    expect([...tree.tree.keys()]).toEqual([childPid]);
  });

  it('produces an empty child list for a leaf process', async () => {
    const tree = await getProcessTree(childPid);

    expect(tree.tree.get(childPid)).toEqual([]);
  });

  it('produces a tree with no children for an unknown pid', async () => {
    const tree = await getProcessTree(-1);

    expect(tree.tree).toEqual(new Map([[-1, []]]));
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

    expect(await exited).toBe('SIGKILL');
  });

  it('leaves processes outside the tree running', async () => {
    await killTree(childPid);

    await vi.waitFor(() => {
      expect(isAlive(childPid)).toBe(false);
    });
    expect(isAlive(parent.pid!)).toBe(true);
  });

  it('ignores processes which no longer exist', async () => {
    killTreeSync(parent, childPid);
    await vi.waitFor(() => {
      expect(isAlive(parent.pid!)).toBe(false);
    });

    await expect(killTree(parent.pid!)).resolves.toBeUndefined();
  });
});
