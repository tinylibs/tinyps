import { spawn } from 'node:child_process';
import { platform } from 'node:process';

async function spawnAsync(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export interface ProcessTree {
  tree: Map<number, number[]>;
  root: number;
}

function killAll(processTree: ProcessTree, signal?: NodeJS.Signals): void {
  for (const pid of processTree.tree.keys()) {
    try {
      process.kill(pid, signal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw err;
      }
    }
  }
}

function buildProcessTree(
  pid: number,
  processes: Iterable<[pid: number, ppid: number]>,
): ProcessTree {
  const childrenByParent = new Map<number, number[]>();

  for (const [childPid, parentPid] of processes) {
    if (childPid === pid) {
      continue;
    }
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(childPid);
    childrenByParent.set(parentPid, children);
  }

  const processTree: ProcessTree = { root: pid, tree: new Map() };
  const queue = [pid];
  for (const current of queue) {
    const children = childrenByParent.get(current) ?? [];
    processTree.tree.set(current, children);
    queue.push(...children);
  }
  return processTree;
}

async function buildProcessTreeUnix(pid: number): Promise<ProcessTree> {
  const { stdout } = await spawnAsync('ps', ['-A', '-o', 'pid=,ppid=']);
  const processes = Array.from(
    stdout.matchAll(/^\s*(\d+)\s+(\d+)/gm),
    (match): [number, number] => [Number(match[1]), Number(match[2])],
  );
  return buildProcessTree(pid, processes);
}

interface Win32Process {
  ProcessId: number;
  ParentProcessId: number;
}

async function buildProcessTreeWindows(pid: number): Promise<ProcessTree> {
  const { stdout } = await spawnAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress',
  ]);
  const parsed: Win32Process | Win32Process[] = JSON.parse(stdout);
  const processes = Array.isArray(parsed) ? parsed : [parsed];
  return buildProcessTree(
    pid,
    processes.map((proc): [number, number] => [
      proc.ProcessId,
      proc.ParentProcessId,
    ]),
  );
}

async function killTreeWindows(pid: number): Promise<void> {
  await spawnAsync('taskkill', ['/pid', String(pid), '/T', '/F']);
}

async function killTreeUnix(
  pid: number,
  signal?: NodeJS.Signals,
): Promise<void> {
  const processTree = await buildProcessTreeUnix(pid);
  killAll(processTree, signal);
}

export async function killTree(
  pid: number,
  signal?: NodeJS.Signals,
): Promise<void> {
  if (platform === 'win32') {
    return killTreeWindows(pid);
  }
  return killTreeUnix(pid, signal);
}

export async function getProcessTree(pid: number): Promise<ProcessTree> {
  if (platform === 'win32') {
    return buildProcessTreeWindows(pid);
  }
  return buildProcessTreeUnix(pid);
}
