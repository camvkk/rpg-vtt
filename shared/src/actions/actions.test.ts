import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enablePatches, produceWithPatches } from 'immer';
import { normalizeCustomSystem } from '../customSystem.ts';
import { createCampaign, createCharacter, createToken } from '../defaults.ts';
import { roll } from '../dice.ts';
import { applyOps, opsForViewer, projectChat, projectState } from '../projection.ts';
import type { CampaignState, ChatMessage, CustomSystem, PlayerInfo } from '../types.ts';
import type { Monster } from '../data5e/types.ts';
import { getAction, type ActionCtx } from './index.ts';

enablePatches();

const GOBLIN = {
  id: 'goblin', name: 'Goblin', nameEn: 'Goblin', size: 'small', type: 'Humanoide', alignment: 'NM', ac: 15, acNote: '',
  hp: 7, hpFormula: '2d6', speed: '30 pés', speedFt: 30, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  saves: {}, skills: { stealth: 6 }, vulnerabilities: '', resistances: '', immunities: '', conditionImmunities: '', senses: '',
  darkvision: 60, passivePerception: 9, languages: '', cr: 0.25, xp: 50, traits: [],
  actions: [{ name: 'Cimitarra', text: '', attack: { kind: 'melee', bonus: 4, reach: '5 pés', damage: [{ formula: '1d6+2', type: 'slashing' }] } }],
  bonusActions: [], reactions: [], legendary: [], legendaryCount: 0, tags: [],
} as Monster;

function setup() {
  let state = createCampaign({ id: 'c1', code: 'ABC123', name: 'Teste' });
  const dm: PlayerInfo = { id: 'dm', name: 'Mestre', role: 'dm', color: '#e0b45a', avatar: null, characterId: null, joinedAt: 1 };
  const p1: PlayerInfo = { id: 'p1', name: 'Ana', role: 'player', color: '#7cc4fa', avatar: null, characterId: null, joinedAt: 2 };
  const p2: PlayerInfo = { id: 'p2', name: 'Bia', role: 'player', color: '#f472b6', avatar: null, characterId: null, joinedAt: 3 };
  state = { ...state, players: { dm, p1, p2 } };
  const chat: ChatMessage[] = [];
  let seq = 0;
  const run = (actor: PlayerInfo, type: string, payload: unknown) => {
    const def = getAction(type)!;
    assert.ok(def, `unknown action ${type}`);
    const parsed = def.schema.parse(payload);
    const ctx: ActionCtx = {
      actor: { id: actor.id, role: actor.role, name: actor.name, color: actor.color },
      now: Date.now(),
      newId: () => `id${++seq}`,
      roll: (f, o) => roll(f, o),
      chat: {
        post: (d) => {
          const m: ChatMessage = { id: `m${++seq}`, ts: Date.now(), authorId: actor.id, authorName: actor.name, speaker: null, text: '', roll: null, card: null, whisperTo: [], gmOnly: false, blind: false, ...d };
          chat.push(m);
          return m;
        },
        get: (id) => chat.find((m) => m.id === id) ?? null,
        update: () => {},
        remove: () => {},
        clear: () => {},
      },
      fx: () => {},
      lookup: { monster: (id) => (id === 'goblin' ? GOBLIN : undefined), spell: () => undefined },
    };
    const denied = def.permit(state, parsed, ctx);
    if (denied) return { ok: false as const, error: denied, patches: [] };
    let result: unknown;
    const [next, patches] = produceWithPatches(state, (d) => {
      result = def.apply(d as CampaignState, parsed, ctx);
    });
    state = next;
    return { ok: true as const, result, patches };
  };
  return { get state() { return state; }, run, dm, p1, p2, chat };
}

test('players cannot do DM things', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  assert.equal(t.run(t.p1, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromMonster: 'goblin' }).ok, false);
  assert.equal(t.run(t.p1, 'wall.create', { sceneId, walls: [{ c: [0, 0, 100, 0], kind: 'wall', door: 'closed', secret: false }] }).ok, false);
  assert.equal(t.run(t.p1, 'fog.reset', { sceneId, to: 'revealed' }).ok, false);
  assert.equal(t.run(t.p1, 'scene.create', { name: 'x' }).ok, false);
});

test('monster tokens get statblock data and numbered names', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  const r = t.run(t.dm, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromMonster: 'goblin', count: 3 });
  assert.equal(r.ok, true);
  const names = Object.values(t.state.scenes[sceneId]!.tokens).map((x) => x.name).sort();
  assert.deepEqual(names, ['Goblin', 'Goblin 2', 'Goblin 3']);
  const g = Object.values(t.state.scenes[sceneId]!.tokens)[0]!;
  assert.equal(g.ac, 15);
  assert.equal(g.hp?.max, 7);
  assert.equal(g.vision.darkvision, 60);
});

test('players move only their own tokens, walls block, DM ignores walls', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  const scene = t.state.scenes[sceneId]!;
  const g = scene.grid.size;
  t.run(t.p1, 'character.create', { character: { name: 'Thalia' } });
  const charId = Object.keys(t.state.characters)[0]!;
  assert.equal(t.state.characters[charId]!.ownerId, 'p1');
  assert.equal(t.run(t.p1, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromCharacter: charId }).ok, true);
  const tokId = Object.keys(t.state.scenes[sceneId]!.tokens)[0]!;
  assert.equal(t.run(t.p2, 'token.move', { sceneId, moves: [{ id: tokId, x: g, y: 0 }] }).ok, false);
  assert.equal(t.run(t.p1, 'token.move', { sceneId, moves: [{ id: tokId, x: g, y: 0 }] }).ok, true);
  t.run(t.dm, 'wall.create', { sceneId, walls: [{ c: [g * 2.5, -500, g * 2.5, 500], kind: 'wall', door: 'closed', secret: false }] });
  const blocked = t.run(t.p1, 'token.move', { sceneId, moves: [{ id: tokId, x: g * 4, y: 0 }] });
  assert.equal(blocked.ok, false);
  assert.equal(t.run(t.dm, 'token.move', { sceneId, moves: [{ id: tokId, x: g * 4, y: 0 }] }).ok, true);
});

test('projection hides secrets from players', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  t.run(t.dm, 'token.create', { sceneId, token: { x: 0, y: 0, hidden: true, name: 'Assassino' } });
  t.run(t.dm, 'token.create', { sceneId, token: { x: 100, y: 0 }, fromMonster: 'goblin' });
  t.run(t.dm, 'wall.create', { sceneId, walls: [{ c: [0, 0, 100, 0], kind: 'door', door: 'closed', secret: true }] });
  t.run(t.dm, 'scene.create', { name: 'Covil secreto' });
  t.run(t.dm, 'journal.create', { entry: { title: 'Plano do vilão', body: 'segredo' } });
  const view = projectState(t.state, { id: 'p1', role: 'player' });
  const tokens = Object.values(view.scenes[sceneId]!.tokens);
  assert.equal(tokens.length, 1, 'hidden token removed');
  assert.equal(tokens[0]!.hpMasked, true, 'monster HP masked');
  assert.equal(tokens[0]!.hp?.max, 100);
  assert.equal(Object.values(view.scenes[sceneId]!.walls)[0]!.kind, 'wall', 'secret door looks like a wall');
  assert.equal(Object.keys(view.scenes).length, 1, 'only the active scene');
  assert.equal(Object.keys(view.journal).length, 0, 'unshared journal hidden');
});

test('patch ops keep the player view in sync and resync on scene change', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  const viewer = { id: 'p1', role: 'player' as const };
  let view = projectState(t.state, viewer);
  const r1 = t.run(t.dm, 'token.create', { sceneId, token: { x: 0, y: 0, name: 'Guarda' } });
  const ops = opsForViewer(t.state, r1.patches, viewer);
  assert.ok(Array.isArray(ops));
  view = applyOps(view, ops as never);
  assert.equal(Object.keys(view.scenes[sceneId]!.tokens).length, 1);
  const tokId = Object.keys(t.state.scenes[sceneId]!.tokens)[0]!;
  const r2 = t.run(t.dm, 'token.update', { sceneId, id: tokId, patch: { hidden: true } });
  view = applyOps(view, opsForViewer(t.state, r2.patches, viewer) as never);
  assert.equal(Object.keys(view.scenes[sceneId]!.tokens).length, 0, 'hiding removes it from the player view');
  const r3 = t.run(t.dm, 'scene.create', { name: 'Outra', activate: true });
  assert.equal(opsForViewer(t.state, r3.patches, viewer), 'resync');
});

test('attack card compares against AC and DM applies damage', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  t.run(t.dm, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromMonster: 'goblin' });
  t.run(t.p1, 'character.create', {
    character: {
      name: 'Bruna', abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      attacks: [{ id: 'a1', name: 'Espada', ability: 'str', proficient: true, bonus: 0, damage: [{ formula: '1d8+@mod', type: 'slashing' }], range: '', critOn: 20, notes: '', save: null }],
    },
  });
  const charId = Object.keys(t.state.characters)[0]!;
  const goblin = Object.values(t.state.scenes[sceneId]!.tokens)[0]!;
  const r = t.run(t.p1, 'roll.attack', { characterId: charId, sceneId, attackId: 'a1', targets: [goblin.id] });
  assert.equal(r.ok, true);
  const msg = t.chat[t.chat.length - 1]!;
  assert.equal(msg.card?.type, 'attack');
  const card = msg.card as Extract<NonNullable<ChatMessage['card']>, { type: 'attack' }>;
  assert.equal(card.targets[0]!.ac, 15);
  assert.ok(['hit', 'miss', 'crit'].includes(card.targets[0]!.outcome!));
  assert.equal(card.toHit!.formula.includes('+5'), true, 'STR 16 (+3) + prof 2');
  if (card.targets[0]!.outcome !== 'miss') {
    assert.equal(t.run(t.p1, 'card.apply', { messageId: msg.id, targetIndex: 0, multiplier: 1 }).ok, false, 'only DM applies');
    assert.equal(t.run(t.dm, 'card.apply', { messageId: msg.id, targetIndex: 0, multiplier: 1 }).ok, true);
    const after = t.state.scenes[sceneId]!.tokens[goblin.id]!;
    assert.ok(after.hp!.cur < 7);
  }
});

test('combat: turn order, only the active player ends their turn', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  t.run(t.p1, 'character.create', { character: { name: 'Ana PC' } });
  const c1 = Object.keys(t.state.characters)[0]!;
  t.run(t.p1, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromCharacter: c1 });
  t.run(t.dm, 'token.create', { sceneId, token: { x: 200, y: 0 }, fromMonster: 'goblin' });
  const ids = Object.keys(t.state.scenes[sceneId]!.tokens);
  t.run(t.dm, 'combat.start', { sceneId, tokenIds: ids });
  t.run(t.p1, 'combat.roll', { who: 'mine' });
  t.run(t.dm, 'combat.begin', {});
  const combat = t.state.combat!;
  assert.equal(combat.started, true);
  assert.equal(combat.combatants.every((c) => c.initiative !== null), true);
  const cur = combat.combatants[combat.turn]!;
  const playerTurn = cur.ownerIds.includes('p1');
  assert.equal(t.run(t.p1, 'combat.next', {}).ok, playerTurn);
  if (!playerTurn) {
    assert.equal(t.run(t.dm, 'combat.next', {}).ok, true);
    assert.equal(t.run(t.p1, 'combat.next', {}).ok, true);
  }
});

test('chat: whispers and blind rolls are filtered per viewer', () => {
  const t = setup();
  t.run(t.p1, 'chat.send', { text: '/w Bia psiu' });
  t.run(t.p1, 'chat.send', { text: '/br 1d20' });
  const [whisper, blind] = t.chat;
  assert.equal(projectChat(whisper!, { id: 'p2', role: 'player' })?.text, 'psiu');
  assert.equal(projectChat(whisper!, { id: 'dm', role: 'dm' })?.text, 'psiu');
  assert.equal(projectChat(whisper!, { id: 'p3', role: 'player' }), null);
  assert.equal(projectChat(blind!, { id: 'p1', role: 'player' })?.roll, null, 'roller cannot see a blind roll');
  assert.equal(projectChat(blind!, { id: 'p2', role: 'player' }), null);
  assert.ok(projectChat(blind!, { id: 'dm', role: 'dm' })?.roll);
});

test('damage drops a PC to 0 and death saves resolve', () => {
  const t = setup();
  const sceneId = t.state.activeSceneId!;
  t.run(t.p1, 'character.create', { character: { name: 'Frágil', hp: { cur: 5, max: 12, temp: 0 } } });
  const c = Object.keys(t.state.characters)[0]!;
  t.run(t.p1, 'token.create', { sceneId, token: { x: 0, y: 0 }, fromCharacter: c });
  const tok = Object.keys(t.state.scenes[sceneId]!.tokens)[0]!;
  t.run(t.dm, 'token.hp', { sceneId, ids: [tok], op: 'damage', amount: 7 });
  assert.equal(t.state.characters[c]!.hp.cur, 0);
  assert.ok(t.state.characters[c]!.conditions.includes('unconscious'));
  assert.equal(t.run(t.p1, 'character.deathSave', { id: c }).ok, true);
  const ds = t.state.characters[c]!.deathSaves;
  assert.ok(ds.success + ds.fail > 0 || (t.state.characters[c]!.hp.cur as number) === 1);
  t.run(t.dm, 'token.hp', { sceneId, ids: [tok], op: 'heal', amount: 4 });
  assert.equal(t.state.characters[c]!.hp.cur >= 4, true);
  assert.equal(t.state.characters[c]!.conditions.includes('unconscious'), false);
  void createCharacter;
  void createToken;
});

// ---------------------------------------------------------------------------
// Custom systems
// ---------------------------------------------------------------------------

function sampleSystem(): CustomSystem {
  const r = normalizeCustomSystem({
    name: 'Brasas',
    modifier: 'value',
    checkFormula: '1d20+@atr',
    skillFormula: '1d20+@atr+@pericia',
    stats: [{ key: 'vigor', name: 'Vigor', short: 'VIG', min: 0, max: 5, default: 1 }, { key: 'astucia', name: 'Astúcia', short: 'AST', min: 0, max: 5, default: 1 }],
    skills: [{ key: 'luta', name: 'Luta', stat: 'vigor' }],
    resources: [{ key: 'brasa', name: 'Brasa', max: 3 }],
    races: [{ name: 'Anão', statBonuses: { vigor: 1 } }],
    mechanics: [{ name: 'Fôlego', formula: '2d6' }, { name: 'Lenda', description: 'sem dados' }],
  }, { now: 1, sources: ['brasas.md'] });
  if ('error' in r) throw new Error(r.error);
  return r.system;
}

test('custom system: only the DM saves, activates and clears it', () => {
  const t = setup();
  const system = sampleSystem();
  assert.equal(t.run(t.p1, 'system.save', { system }).ok, false);
  assert.equal(t.run(t.dm, 'settings.update', { system: 'custom' }).ok, false, 'nothing to activate yet');
  assert.throws(() => t.run(t.dm, 'system.save', { system: { ...system, stats: [{ ...system.stats[0]!, key: 'Vigor!' }] } }), 'schema rejects bad keys');

  const r = t.run(t.dm, 'system.save', { system });
  assert.equal(r.ok, true);
  assert.equal(t.state.customSystem?.name, 'Brasas');
  assert.equal(t.state.settings.system, 'custom');
  assert.ok(t.chat.some((m) => m.kind === 'system' && m.text.includes('Brasas')));

  assert.equal(t.run(t.p1, 'settings.update', { system: 'dnd5e' }).ok, false);
  assert.equal(t.run(t.dm, 'settings.update', { system: 'dnd5e' }).ok, true);
  assert.equal(t.state.customSystem?.name, 'Brasas', 'switching back keeps the imported system');
  assert.equal(t.run(t.dm, 'settings.update', { system: 'custom' }).ok, true);

  assert.equal(t.run(t.p1, 'system.clear', {}).ok, false);
  assert.equal(t.run(t.dm, 'system.clear', {}).ok, true);
  assert.equal(t.state.customSystem, null);
  assert.equal(t.state.settings.system, 'dnd5e');
  assert.equal(t.run(t.dm, 'system.clear', {}).ok, false, 'nothing left to clear');
});

test('custom system: players see it and roll from their own custom sheet', () => {
  const t = setup();
  const viewer = { id: 'p1', role: 'player' as const };
  let view = projectState(t.state, viewer);
  const saved = t.run(t.dm, 'system.save', { system: sampleSystem() });
  view = applyOps(view, opsForViewer(t.state, saved.patches, viewer) as never);
  assert.equal(view.customSystem?.name, 'Brasas', 'the system reaches players through patches');
  assert.equal(view.settings.system, 'custom');
  assert.equal(projectState(t.state, viewer).customSystem?.stats.length, 2);

  t.run(t.p1, 'character.create', { character: { name: 'Tora', race: 'Anão' } });
  const charId = Object.keys(t.state.characters)[0]!;
  assert.equal(t.state.characters[charId]!.custom, null, 'sheets start without custom values');
  const upd = t.run(t.p1, 'character.update', { id: charId, patch: { custom: { stats: { vigor: 3, astucia: 2 }, skills: { luta: 2 }, resources: { brasa: { cur: 2, max: 3 } } } } });
  assert.equal(upd.ok, true);
  assert.throws(() => t.run(t.p1, 'character.update', { id: charId, patch: { custom: { stats: { 'não-pode': 1 }, skills: {}, resources: {} } } }));

  const stat = t.run(t.p1, 'roll.custom', { characterId: charId, kind: 'stat', key: 'vigor' });
  assert.equal(stat.ok, true);
  const card = t.chat[t.chat.length - 1]!.card as Extract<NonNullable<ChatMessage['card']>, { type: 'check' }>;
  assert.equal(card.type, 'check');
  assert.equal(card.title, 'Teste de Vigor');
  assert.equal(card.roll.formula, '1d20+4', 'vigor 3 + 1 from Anão');

  t.run(t.p1, 'roll.custom', { characterId: charId, kind: 'skill', key: 'luta' });
  const skillCard = t.chat[t.chat.length - 1]!.card as typeof card;
  assert.equal(skillCard.roll.formula, '1d20+4+2');

  assert.equal(t.run(t.p1, 'roll.custom', { characterId: charId, kind: 'mechanic', key: 'folego' }).ok, true);
  assert.equal(t.run(t.p1, 'roll.custom', { characterId: charId, kind: 'mechanic', key: 'lenda' }).ok, false, 'no formula to roll');
  assert.equal(t.run(t.p2, 'roll.custom', { characterId: charId, kind: 'stat', key: 'vigor' }).ok, false, 'not your sheet');
  assert.equal(t.run(t.dm, 'roll.custom', { characterId: charId, kind: 'stat', key: 'vigor' }).ok, true, 'the DM rolls any sheet');

  t.run(t.dm, 'settings.update', { system: 'dnd5e' });
  assert.equal(t.run(t.p1, 'roll.custom', { characterId: charId, kind: 'stat', key: 'vigor' }).ok, false, 'inactive system cannot roll');
});
