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
const { root, tree } = await getProcessTree(child.pid);
console.log(tree.get(root)); // [ 1234, 1235 ]
```

## API

### `killTree(pid, signal?)`

- `pid` (`number`) - process to kill, along with all of its descendants
- `signal` (`NodeJS.Signals`, optional) - signal to send, defaults to `SIGTERM`
- Returns `Promise<void>`

Processes which have already exited are ignored. On Windows, termination is
delegated to `taskkill` and `signal` has no effect.

### `getProcessTree(pid)`

- `pid` (`number`) - process to build the tree from
- Returns `Promise<ProcessTree>`

Resolves with the process tree rooted at `pid`. Processes outside that tree are
excluded, so an unknown `pid` produces a tree containing only itself.

### `ProcessTree`

```ts
interface ProcessTree {
  tree: Map<number, number[]>;
  root: number;
}
```

`tree` maps each process in the tree to the pids of its direct children. `root`
is the pid the tree was built from.

## License

MIT
