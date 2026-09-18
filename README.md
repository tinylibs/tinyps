# ⚙️ tinyproc

A cross-platform library of utilities for dealing with system processes.

## Install

```sh
npm install tinyproc
```

## Usage

```ts
import { killTree, getProcessTree } from 'tinyproc';

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

### `findProcessesByPort(port, options?)`

- `port` (`number`) - local port to match against
- `options.protocol` (`'tcp' | 'udp'`, optional) - only match sockets of this
  protocol, defaults to matching both
- Returns `Promise<ProcessInfo[]>`

Matches any process holding a socket bound to `port` locally, whether it is
listening or connected.

## License

MIT
