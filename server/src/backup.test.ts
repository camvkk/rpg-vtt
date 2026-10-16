import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// Fake S3 bucket: objects in a Map; `failing` makes every request answer 500.
const objects = new Map<string, Buffer>();
let failing = false;
const authHeaders: string[] = [];
const fake = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    authHeaders.push(String(req.headers.authorization));
    if (failing) return void res.writeHead(500).end('boom');
    const key = decodeURIComponent(req.url!);
    if (req.method === 'PUT') {
      objects.set(key, Buffer.concat(chunks));
      return void res.writeHead(200).end();
    }
    const obj = objects.get(key);
    if (!obj) return void res.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
    res.writeHead(200).end(obj);
  });
});
await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
const { port } = fake.address() as { port: number };

// config reads env at import time.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-backup-'));
Object.assign(process.env, {
  DATA_DIR: dir,
  S3_ENDPOINT: `http://127.0.0.1:${port}`,
  S3_BUCKET: 'mesa',
  S3_ACCESS_KEY_ID: 'AKIDTEST',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PREFIX: 'prod',
  SNAPSHOT_INTERVAL_MS: '3600000',
});
const backup = await import('./backup.ts');
const { closeDb, getDb } = await import('./db.ts');

test.after(() => {
  closeDb();
  fake.close();
});

test('signV4 matches the AWS documentation example (GET Object)', () => {
  const auth = backup.signV4({
    method: 'GET', path: '/test.txt', query: '',
    headers: {
      host: 'examplebucket.s3.amazonaws.com',
      range: 'bytes=0-9',
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'x-amz-date': '20130524T000000Z',
    },
    region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
    + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
    + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('empty bucket → local start, then snapshots survive a wiped filesystem', async () => {
  await backup.restoreBackup();
  getDb().prepare("INSERT INTO chat (id, campaign_id, ts, data) VALUES ('m1', 'c1', 1, '{}')").run();
  backup.startBackups();
  await backup.flushBackup();
  const gz = objects.get('/mesa/prod/vtt.db.gz');
  assert.ok(gz, 'snapshot uploaded under the prefix');
  assert.equal(zlib.gunzipSync(gz).subarray(0, 15).toString(), 'SQLite format 3');
  assert.match(authHeaders.at(-1)!, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/us-east-1\/s3\/aws4_request/);

  // Nothing changed → no new upload.
  const puts = authHeaders.length;
  await backup.flushBackup();
  assert.equal(authHeaders.length, puts);

  // Simulate a restart on a fresh disk (Render free spin-down / redeploy).
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
  await backup.restoreBackup();
  const row = getDb().prepare("SELECT id FROM chat WHERE id = 'm1'").get();
  assert.deepEqual({ ...row }, { id: 'm1' });
});

test('uploads go to the bucket and come back after a restart', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  await backup.backupAsset('c1', 'abc.png', png, 'image/png');
  assert.deepEqual(objects.get('/mesa/prod/assets/c1/abc.png'), png);
  const local = path.join(dir, 'assets', 'c1', 'abc.png');
  fs.rmSync(local, { force: true });
  assert.deepEqual(await backup.fetchAsset('c1', 'abc.png'), png);
  assert.ok(fs.existsSync(local), 'cached on local disk');
  assert.equal(await backup.fetchAsset('c1', 'missing.png'), null);
});

test('unreachable bucket → refuses to start instead of opening an empty database', async () => {
  failing = true;
  try {
    await assert.rejects(backup.restoreBackup({ attempts: 2, delayMs: 1 }), /não foi possível restaurar/);
  } finally {
    failing = false;
  }
});
