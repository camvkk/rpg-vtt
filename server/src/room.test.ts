import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir for this test run (config reads env at import time).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-test-'));
process.env.DATA_DIR = dir;

const { createCampaignFromRequest, getRoom } = await import('./rooms.ts');
type Emitted = { event: string; args: unknown[] };

/** Minimal fake socket that serializes everything like socket.io would. */
function fakeSocket(id: string, playerId: string, role: 'dm' | 'player') {
  const emitted: Emitted[] = [];
  return {
    id,
    data: { campaignId: null as string | null, playerId, role },
    emitted,
    emit(event: string, ...args: unknown[]) {
      // structuredClone throws on revoked proxies, just like the socket.io encoder did.
      emitted.push({ event, args: structuredClone(args) });
      return true;
    },
    join() {},
    leave() {},
  };
}

test('room dispatch delivers patches, chat and fx without leaking drafts', () => {
  const { code } = createCampaignFromRequest({ name: 'Teste', dmName: 'Mestre', starter: 'tavern' });
  const room = getRoom(code)!;
  const dm = Object.values(room.state.players)[0]!;
  const sDm = fakeSocket('s1', dm.id, 'dm');
  sDm.data.campaignId = room.id;
  room.attach(sDm as never);
  const sceneId = room.state.activeSceneId!;

  let r = room.dispatch(dm, 's1', 'token.create', { sceneId, token: { x: 0, y: 0, name: 'Guarda' } });
  assert.equal(r.ok, true);
  const tokenId = Object.keys(room.state.scenes[sceneId]!.tokens)[0]!;

  r = room.dispatch(dm, 's1', 'combat.start', { sceneId, tokenIds: [tokenId] });
  assert.equal(r.ok, true);
  r = room.dispatch(dm, 's1', 'combat.begin', {});
  assert.equal(r.ok, true, 'combat.begin (emits a turn fx with draft data) must not crash');
  assert.ok(sDm.emitted.some((e) => e.event === 'fx' && (e.args[0] as { type: string }).type === 'turn'));
  r = room.dispatch(dm, 's1', 'combat.next', {});
  assert.equal(r.ok, true);
  r = room.dispatch(dm, 's1', 'chat.send', { text: '/r 2d6+3 dano' });
  assert.equal(r.ok, true);
  assert.ok(sDm.emitted.some((e) => e.event === 'chat'));
  r = room.dispatch(dm, 's1', 'scene.activate', { id: sceneId });
  assert.equal(r.ok, true);
  room.save();
});

test('invalid payloads are rejected with a readable error', () => {
  const { code } = createCampaignFromRequest({ name: 'Teste 2', dmName: 'Mestre' });
  const room = getRoom(code)!;
  const dm = Object.values(room.state.players)[0]!;
  const r = room.dispatch(dm, 's9', 'token.move', { sceneId: 'x', moves: 'nope' });
  assert.equal(r.ok, false);
  const r2 = room.dispatch(dm, 's9', 'does.not.exist', {});
  assert.equal(r2.ok, false);
});
