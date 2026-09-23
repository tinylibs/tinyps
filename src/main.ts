import { spawn } from 'node:child_process';
import { platform } from 'node:process';
import {
  parseLsofOutput,
  parseOwningProcessJson,
  parsePsOutput,
  parseSsOutput,
  parseWin32ProcessJson,
  type ProcessInfo,
} from './parse.js';

export type { ProcessInfo };

async function spawnAsync(
  command: string,
  args: string[],
  allowedExitCodes?: number[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      const allowed =
        allowedExitCodes === undefined || code === null
          ? code === 0
          : allowedExitCodes.includes(code);

      if (allowed) {
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

export type ProcessTree = Map<number, number[]>;

export type Protocol = 'tcp' | 'udp';

function killAll(processTree: ProcessTree, signal?: NodeJS.Signals): void {
  const errors: unknown[] = [];

  const pids = Array.from(processTree.keys()).reverse();

  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
        errors.push(err);
      }
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to kill one or more processes');
  }
}

function buildProcessTree(
  pid: number,
  processes: Iterable<[pid: number, ppid: number]>,
): ProcessTree {
  const childrenByParent = new Map<number, number[]>();
  let exists = false;

  for (const [childPid, parentPid] of processes) {
    if (childPid === pid) {
      exists = true;
      continue;
    }
    if (childPid <= 0) {
      continue;
    }
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(childPid);
    childrenByParent.set(parentPid, children);
  }

  const processTree: ProcessTree = new Map();

  if (!exists) {
    return processTree;
  }

  const queue = [pid];
  for (const current of queue) {
    const children = childrenByParent.get(current) ?? [];
    processTree.set(current, children);
    queue.push(...children);
  }
  return processTree;
}

async function listProcessesUnix(): Promise<ProcessInfo[]> {
  const { stdout } = await spawnAsync('ps', [
    '-A',
    '-ww',
    '-o',
    'ppid=,pid=,args=',
  ]);

  return parsePsOutput(stdout);
}

async function listProcessesWindows(): Promise<ProcessInfo[]> {
  const { stdout } = await spawnAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ' +
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
  ]);

  return parseWin32ProcessJson(stdout);
}

async function findPidsByPortLinux(
  port: number,
  protocol?: Protocol,
): Promise<number[]> {
  const protocolArgs: string[] = [];
  if (protocol !== 'udp') {
    protocolArgs.push('-t');
  }
  if (protocol !== 'tcp') {
    protocolArgs.push('-u');
  }

  const { stdout } = await spawnAsync('ss', [
    '-nHpa',
    ...protocolArgs,
    `sport = :${port}`,
  ]);

  return parseSsOutput(stdout);
}

async function findPidsByPortDarwin(
  port: number,
  protocol?: Protocol,
): Promise<number[]> {
  const selector =
    protocol === undefined
      ? `-i:${port}`
      : `-i${protocol.toUpperCase()}:${port}`;
  // lsof exits 1 when nothing matches
  const { stdout } = await spawnAsync(
    'lsof',
    ['-nP', '-Fpn', selector],
    [0, 1],
  );

  return parseLsofOutput(stdout, port);
}

async function findPidsByPortWindows(
  port: number,
  protocol?: Protocol,
): Promise<number[]> {
  const queries: string[] = [];
  if (protocol !== 'udp') {
    queries.push(`Get-NetTCPConnection -LocalPort ${port}`);
  }
  if (protocol !== 'tcp') {
    queries.push(`Get-NetUDPEndpoint -LocalPort ${port}`);
  }

  const query = queries
    .map((cmd) => `${cmd} -ErrorAction SilentlyContinue`)
    .join('; ');
  const { stdout } = await spawnAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); ' +
      `@(${query}) | Select-Object -ExpandProperty OwningProcess | ` +
      'ConvertTo-Json -Compress',
  ]);

  return parseOwningProcessJson(stdout);
}

async function killTreeWindows(pid: number): Promise<void> {
  // taskkill on windows exits 128 when its not found.
  // unix/macos exit with 0 when the process is not found.
  await spawnAsync('taskkill', ['/pid', String(pid), '/T', '/F'], [0, 128]);
}

async function killTreeUnix(
  pid: number,
  signal?: NodeJS.Signals,
): Promise<void> {
  const processTree = await getProcessTree(pid);
  killAll(processTree, signal);
}

export async function killTree(
  pid: number,
  signal?: NodeJS.Signals,
): Promise<void> {
  if (pid <= 0) {
    throw new TypeError(`Expected a positive pid, received: ${pid}`);
  }

  if (platform === 'win32') {
    return killTreeWindows(pid);
  }
  return killTreeUnix(pid, signal);
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  if (platform === 'win32') {
    return listProcessesWindows();
  }
  return listProcessesUnix();
}

export async function getProcessInfo(
  pid: number,
): Promise<ProcessInfo | undefined> {
  const processes = await listProcesses();
  return processes.find((proc) => proc.pid === pid);
}

export async function findProcessesByName(
  name: string,
  options?: { loose?: boolean },
): Promise<ProcessInfo[]> {
  const processes = await listProcesses();

  if (options?.loose) {
    const needle = name.toLowerCase();
    return processes.filter((proc) => proc.name.toLowerCase().includes(needle));
  }

  return processes.filter((proc) => proc.name === name);
}

export async function findProcessesByPort(
  port: number,
  options?: { protocol?: Protocol },
): Promise<ProcessInfo[]> {
  let pids: number[];

  if (platform === 'win32') {
    pids = await findPidsByPortWindows(port, options?.protocol);
  } else if (platform === 'linux') {
    pids = await findPidsByPortLinux(port, options?.protocol);
  } else {
    pids = await findPidsByPortDarwin(port, options?.protocol);
  }

  const matched = new Set(pids);

  if (matched.size === 0) {
    return [];
  }

  const processes = await listProcesses();
  return processes.filter((proc) => matched.has(proc.pid));
}

export async function getProcessTree(pid: number): Promise<ProcessTree> {
  const processes = await listProcesses();
  return buildProcessTree(
    pid,
    processes.map((proc): [number, number] => [proc.pid, proc.ppid]),
  );
}

export function isRunning(pid: number): boolean {
  if (pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function getDescendants(pid: number): Promise<number[]> {
  const tree = await getProcessTree(pid);
  return Array.from(tree.keys()).filter((current) => current !== pid);
}
