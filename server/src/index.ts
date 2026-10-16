import http from 'node:http';
import { Server } from 'socket.io';
import { backupEnabled, flushBackup, restoreBackup, startBackups } from './backup.ts';
import { aiEnabled, config } from './config.ts';
import { closeDb, getDb } from './db.ts';
import { createApp } from './http.ts';
import type { VttServer } from './room.ts';
import { saveAll, sweepRooms } from './rooms.ts';
import { registerSocketHandlers } from './socket.ts';

// No persistent disk? The database lives in a bucket and must be back before it's opened.
await restoreBackup();
getDb();
startBackups();

const app = createApp();
const server = http.createServer(app);

const io: VttServer = new Server(server, {
  maxHttpBufferSize: 2 * 1024 * 1024,
  pingInterval: 20_000,
  pingTimeout: 25_000,
  cors: config.corsOrigins.length ? { origin: config.corsOrigins, credentials: false } : undefined,
});

registerSocketHandlers(io);

const sweep = setInterval(() => sweepRooms(), 60_000);
const autosave = setInterval(() => saveAll(), 15_000);

server.listen(config.port, config.host, () => {
  console.log(`\n  ⚔️  RPG VTT v2 rodando em http://localhost:${config.port}`);
  console.log(`  📦 Dados em ${config.dataDir}${backupEnabled() ? ` (cópia no bucket ${config.s3.bucket})` : ''}`);
  console.log(`  🔮 Oráculo (IA): ${aiEnabled() ? 'ligado' : 'desligado (defina MOONSHOT_API_KEY ou OPENROUTER_API_KEY)'}\n`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} recebido — salvando campanhas...`);
  clearInterval(sweep);
  clearInterval(autosave);
  saveAll();
  void io.close();
  const exit = () => {
    closeDb();
    process.exit(0);
  };
  void Promise.allSettled([new Promise((r) => server.close(r)), flushBackup()]).then(exit);
  setTimeout(exit, backupEnabled() ? 25_000 : 3_000).unref();
}
// Last line of defense: a game server should log a bug, keep running and keep everyone's session alive.
process.on('uncaughtException', (err) => {
  console.error('[fatal?] uncaught exception — continuing', err);
  try {
    saveAll();
  } catch {
    // ignore
  }
});
process.on('unhandledRejection', (err) => {
  console.error('[warn] unhandled rejection', err);
});
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
