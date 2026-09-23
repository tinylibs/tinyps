import { basename } from 'node:path';

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
}

interface Win32Process {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

// This matches `{ppid} {pid} {command}`, allowing spaces in the command
const processListPattern = /^\s*(\d+)\s+(\d+)\s+(.*)$/gm;
// `ss` reports socket owners as `users:(("name",pid=123,fd=4),...)`
const socketOwnerPattern = /pid=(\d+)/g;
// This matches the extensions windows includes in process names
const executableExtensionPattern = /\.exe$/i;
// Login shells are executed with a `-` prefixed to their argv[0]
const loginShellPattern = /^-/;

export function parsePsOutput(stdout: string): ProcessInfo[] {
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

export function parseWin32ProcessJson(stdout: string): ProcessInfo[] {
  const parsed: Win32Process | Win32Process[] = JSON.parse(stdout);
  const processes = Array.isArray(parsed) ? parsed : [parsed];

  return processes.map((proc): ProcessInfo => ({
    pid: proc.ProcessId,
    ppid: proc.ParentProcessId,
    name: proc.Name.replace(executableExtensionPattern, ''),
    command: proc.CommandLine ?? proc.Name,
  }));
}

export function parseSsOutput(stdout: string): number[] {
  return Array.from(stdout.matchAll(socketOwnerPattern), (match) =>
    Number(match[1]),
  );
}

export function parseLsofOutput(stdout: string, port: number): number[] {
  const pids: number[] = [];
  let currentPid: number | undefined;

  // Field output is a `p{pid}` line followed by an `n{address}` line
  for (const line of stdout.split('\n')) {
    const value = line.slice(1);

    if (line[0] === 'p') {
      currentPid = Number(value);
    } else if (line[0] === 'n' && currentPid !== undefined) {
      // Example connected output: 192.168.1.99:57253->1.2.3.4:443
      // Example listening output: [::1]:57355
      const separator = value.indexOf('->');
      const local = separator === -1 ? value : value.slice(0, separator);

      if (Number(local.slice(local.lastIndexOf(':') + 1)) === port) {
        pids.push(currentPid);
      }
    }
  }

  return pids;
}

export function parseOwningProcessJson(stdout: string): number[] {
  if (stdout.trim() === '') {
    return [];
  }

  const parsed: number | number[] = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}
