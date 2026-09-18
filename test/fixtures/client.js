import { connect } from 'node:net';

const socket = connect(Number(process.argv[2]), '127.0.0.1', () => {
  process.stdout.write('connected\n');
});

socket.on('error', () => process.exit(1));
