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

### `getProcessTree(pid)`

- `pid` (`number`) - process to build the tree from
- Returns `Promise<ProcessTree>`

### `isRunning(pid)`

- `pid` (`number`) - process to check
- Returns `boolean`

### `getDescendants(pid)`

- `pid` (`number`) - process to collect descendants of
- Returns `Promise<number[]>`

## License

MIT
