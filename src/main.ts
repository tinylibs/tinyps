import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { platform } from 'node:process';

async function spawnAsync(
  command: string,
  args: string[],
  allowedExitCodes?: number[],
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

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
}

function killAll(processTree: ProcessTree, signal?: NodeJS.Signals): void {
  for (const pid of processTree.keys()) {
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

  const processTree: ProcessTree = new Map();
  const queue = [pid];
  for (const current of queue) {
    const children = childrenByParent.get(current) ?? [];
    processTree.set(current, children);
    queue.push(...children);
  }
  return processTree;
}

// This matches `{ppid} {pid} {command}`, allowing spaces in the command
const processListPattern = /^\s*(\d+)\s+(\d+)\s+(.*)$/gm;
// This matches the extensions windows includes in process names
const executableExtensionPattern = /\.exe$/i;
// Login shells are executed with a `-` prefixed to their argv[0]
const loginShellPattern = /^-/;

async function listProcessesUnix(): Promise<ProcessInfo[]> {
  const { stdout } = await spawnAsync('ps', [
    '-A',
    '-ww',
    '-o',
    'ppid=,pid=,args=',
  ]);

  return Array.from(
    stdout.matchAll(processListPattern),
    (match): ProcessInfo => {
      const command = match[3]!.trim();
      const end = command.indexOf(' ');
      const executable = end === -1 ? command : command.slice(0, end);

      return {
        pid: Number(match[2]),
        ppid: Number(match[1]),
        name: basename(executable.replace(loginShellPattern, '')),
        command,
      };
    },
  );
}

interface Win32Process {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

async function listProcessesWindows(): Promise<ProcessInfo[]> {
  const { stdout } = await spawnAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
  ]);
  const parsed: Win32Process | Win32Process[] = JSON.parse(stdout);
  const processes = Array.isArray(parsed) ? parsed : [parsed];
  return processes.map((proc): ProcessInfo => ({
    pid: proc.ProcessId,
    ppid: proc.ParentProcessId,
    name: proc.Name.replace(executableExtensionPattern, ''),
    command: proc.CommandLine ?? proc.Name,
  }));
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
