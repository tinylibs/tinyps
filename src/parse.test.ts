import { describe, expect, it } from 'vitest';
import {
  parseLsofOutput,
  parseOwningProcessJson,
  parsePsOutput,
  parseSsOutput,
  parseWin32ProcessJson,
} from './parse.js';

describe('parsePsOutput', () => {
  it('parses each process', () => {
    const output = [
      '    0     1 /sbin/launchd',
      '    1   526 /usr/libexec/logd',
      '  526  1337 /usr/local/bin/node ./server.js',
    ].join('\n');

    expect(parsePsOutput(output)).toEqual([
      { pid: 1, ppid: 0, name: 'launchd', command: '/sbin/launchd' },
      { pid: 526, ppid: 1, name: 'logd', command: '/usr/libexec/logd' },
      {
        pid: 1337,
        ppid: 526,
        name: 'node',
        command: '/usr/local/bin/node ./server.js',
      },
    ]);
  });

  it('parses an empty list', () => {
    expect(parsePsOutput('')).toEqual([]);
  });

  it('ignores the header of an unexpectedly labelled list', () => {
    const output = ['  PPID   PID ARGS', '    1   526 /usr/libexec/logd'].join(
      '\n',
    );

    expect(parsePsOutput(output)).toEqual([
      { pid: 526, ppid: 1, name: 'logd', command: '/usr/libexec/logd' },
    ]);
  });

  it('strips the prefix from the argv[0] of a login shell', () => {
    const process = parsePsOutput('    1   526 -zsh')[0]!;

    expect(process.name).toBe('zsh');
    expect(process.command).toBe('-zsh');
  });

  it('parses a kernel thread', () => {
    expect(parsePsOutput('    2  1234 [kworker/0:1]')[0]).toEqual({
      pid: 1234,
      ppid: 2,
      // this looks weird because we basename() it
      name: '0:1]',
      command: '[kworker/0:1]',
    });
  });
});

describe('parseWin32ProcessJson', () => {
  it('parses each process', () => {
    const output = JSON.stringify([
      {
        ProcessId: 4,
        ParentProcessId: 0,
        Name: 'System',
        CommandLine: null,
      },
      {
        ProcessId: 1337,
        ParentProcessId: 4,
        Name: 'node.exe',
        CommandLine: '"C:\\Program Files\\nodejs\\node.exe" .\\server.js',
      },
    ]);

    expect(parseWin32ProcessJson(output)).toEqual([
      { pid: 4, ppid: 0, name: 'System', command: 'System' },
      {
        pid: 1337,
        ppid: 4,
        name: 'node',
        command: '"C:\\Program Files\\nodejs\\node.exe" .\\server.js',
      },
    ]);
  });

  it('parses a list of a single process', () => {
    const output = JSON.stringify({
      ProcessId: 1337,
      ParentProcessId: 4,
      Name: 'node.exe',
      CommandLine: 'node .\\server.js',
    });

    expect(parseWin32ProcessJson(output)).toEqual([
      { pid: 1337, ppid: 4, name: 'node', command: 'node .\\server.js' },
    ]);
  });
});

describe('parseSsOutput', () => {
  it('parses the pid of each socket owner', () => {
    const output = [
      'tcp   LISTEN 0      511    127.0.0.1:3000   0.0.0.0:*    users:(("node",pid=1337,fd=23))',
      'tcp   ESTAB  0      0        10.0.0.2:3000   10.0.0.9:52398 users:(("node",pid=1338,fd=25))',
    ].join('\n');

    expect(parseSsOutput(output)).toEqual([1337, 1338]);
  });

  it('parses every owner of a shared socket', () => {
    const output =
      'udp   UNCONN 0      0        0.0.0.0:5353   0.0.0.0:*    ' +
      'users:(("avahi-daemon",pid=700,fd=12),("avahi-daemon",pid=701,fd=12))';

    expect(parseSsOutput(output)).toEqual([700, 701]);
  });

  it('parses a socket with no owner', () => {
    const output = 'tcp   LISTEN 0      511    127.0.0.1:3000   0.0.0.0:*    ';

    expect(parseSsOutput(output)).toEqual([]);
  });

  it('parses an empty list', () => {
    expect(parseSsOutput('')).toEqual([]);
  });
});

describe('parseLsofOutput', () => {
  it('parses the pid of a process listening on the port', () => {
    const output = ['p1337', 'f23', 'n[::1]:3000', ''].join('\n');

    expect(parseLsofOutput(output, 3000)).toEqual([1337]);
  });

  it('parses a process listening on every address', () => {
    const output = ['p1337', 'f23', 'n*:3000', ''].join('\n');

    expect(parseLsofOutput(output, 3000)).toEqual([1337]);
  });

  it('parses a process connected to the port locally', () => {
    const output = [
      'p1337',
      'f23',
      'n127.0.0.1:3000->127.0.0.1:52398',
      '',
    ].join('\n');

    expect(parseLsofOutput(output, 3000)).toEqual([1337]);
  });

  it('ignores a process connected to the port remotely', () => {
    const output = [
      'p1338',
      'f25',
      'n127.0.0.1:52398->127.0.0.1:3000',
      '',
    ].join('\n');

    expect(parseLsofOutput(output, 3000)).toEqual([]);
  });

  it('parses each process holding a socket on the port', () => {
    const output = [
      'p1337',
      'f23',
      'n*:3000',
      'p1338',
      'f25',
      'n127.0.0.1:3000->127.0.0.1:52398',
      '',
    ].join('\n');

    expect(parseLsofOutput(output, 3000)).toEqual([1337, 1338]);
  });

  it('parses every socket of a single process', () => {
    const output = ['p1337', 'f23', 'n*:3000', 'f25', 'n*:3001', ''].join('\n');

    expect(parseLsofOutput(output, 3001)).toEqual([1337]);
  });

  it('parses an empty list', () => {
    expect(parseLsofOutput('', 3000)).toEqual([]);
  });
});

describe('parseOwningProcessJson', () => {
  it('parses each pid', () => {
    expect(parseOwningProcessJson('[1337,1338]')).toEqual([1337, 1338]);
  });

  it('parses a list of a single pid', () => {
    expect(parseOwningProcessJson('1337')).toEqual([1337]);
  });

  it('parses an empty list', () => {
    expect(parseOwningProcessJson('\r\n')).toEqual([]);
  });
});
