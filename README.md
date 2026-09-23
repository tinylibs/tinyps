# ⚙️ tinyps

A cross-platform library of utilities for dealing with system processes.

## Install

```sh
npm install tinyps
```

## Usage

```ts
import { killTree, getProcessTree } from 'tinyps';

// kill a process and everything it spawned
await killTree(child.pid);

// or inspect the tree first
const tree = await getProcessTree(child.pid);
console.log(tree.get(child.pid)); // [ 1234, 1235 ]
```

## API

### `killTree(pid, signal?)`

- `pid` (`number`) - process to kill, along with all of its descendants
- `signal` (`NodeJS.Signals`, optional) - signal to send, defaults to `SIGTERM`
- Returns `Promise<void>`

Note that `signal` is not supported on Windows, and will be ignored.

### `getProcessTree(pid)`

- `pid` (`number`) - process to build the tree from
- Returns `Promise<ProcessTree>`

### `isRunning(pid)`

- `pid` (`number`) - process to check
- Returns `boolean`

A zombie process is still in the process table, so this returns `true` for a
process which has exited but has not yet been released by its parent.

### `getDescendants(pid)`

- `pid` (`number`) - process to collect descendants of
- Returns `Promise<number[]>`

### `listProcesses()`

- Returns `Promise<ProcessInfo[]>`

### `getProcessInfo(pid)`

- `pid` (`number`) - process to look up
- Returns `Promise<ProcessInfo | undefined>`

### `findProcessesByName(name, options?)`

- `name` (`string`) - name to match against
- `options.loose` (`boolean`, optional) - match any name containing `name`, ignoring case
- Returns `Promise<ProcessInfo[]>`

Names come from the process' `argv[0]`, so a process which has renamed itself
(e.g. via `process.title`) matches its new name rather than its executable.

### `findProcessesByPort(port, options?)`

- `port` (`number`) - local port to match against
- `options.protocol` (`'tcp' | 'udp'`, optional) - only match sockets of this
  protocol, defaults to matching both
- Returns `Promise<ProcessInfo[]>`

Matches any process holding a socket bound to `port` locally, whether it is
listening or connected.

## License

MIT
