// Runs the API server (with --watch) and the Vite dev server together: `npm run dev`.
import { spawn, type ChildProcess } from 'node:child_process';

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

function run(name: string, color: string, args: string[]): ChildProcess {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: isWin, env: process.env });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream: NodeJS.ReadableStream | null, out: NodeJS.WriteStream) => {
    let buf = '';
    stream?.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}saiu com código ${code}\n`);
    shutdown();
  });
  return child;
}

const children = [
  run('server', '33', ['run', 'dev:server']),
  run('client', '36', ['run', 'dev:client']),
];

let down = false;
function shutdown(): void {
  if (down) return;
  down = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
