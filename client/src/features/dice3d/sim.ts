/**
 * Headless dice simulation (cannon-es, fixed 1/60 timestep).
 *
 * The throw is simulated before anything is shown; every frame of every die is
 * recorded, then the recording is played back by the renderer. No DOM / three.js
 * here so the same code can run under Node for tuning.
 */
import {
  Body,
  ContactMaterial,
  ConvexPolyhedron,
  Material,
  Plane,
  Quaternion as CQuat,
  Vec3 as CVec3,
  World,
} from 'cannon-es';
import {
  findUpFeature,
  normalize,
  quatFromUnitVectors,
  quatMultiply,
  quatNormalize,
  quatRotate,
  quatSlerp,
  type DieKind,
  type Quat,
  type Vec3,
} from './faces.ts';
import { getShape } from './shapes.ts';

export const SIM_DT = 1 / 60;
/** Floats per die per frame: px py pz qx qy qz qw. */
export const STRIDE = 7;

type XZ = [number, number];

/** Visible floor region (x, z). "near" = bottom of the screen (+Z), "right" = +X. */
export interface Arena {
  nearLeft: XZ;
  nearRight: XZ;
  farRight: XZ;
  farLeft: XZ;
}

export type ContactTarget = 'die' | 'floor' | 'wall';

export interface SimEvent {
  frame: number;
  die: number;
  target: ContactTarget;
  /** Impact speed along the contact normal (world units / s). */
  speed: number;
}

export interface SimResult {
  frames: Float32Array;
  frameCount: number;
  dieCount: number;
  events: SimEvent[];
  /** Per die: body-space feature index that ended on top. */
  landed: number[];
  /** Per die: final body orientation (after snapping). */
  finalQuats: Quat[];
  /** Lower is better; 0 = clean throw (all dice visible, flat, on the floor). */
  quality: number;
  /** Diagnostics. */
  stats: { simFrames: number; settled: boolean; outside: number; stacked: number; cocked: number };
}

export interface SimTuning {
  gravity: number;
  /** Throw speed = speedK * sqrt(distance to target) (units/s). */
  speedK: number;
  spin: [number, number];
  maxFrames: number;
  dampingBoostFrame: number;
  /** Minimum inward speed forced onto dice that are still off-screen. */
  herdSpeed: number;
  linearDamping: number;
  angularDamping: number;
}

export const DEFAULT_TUNING: SimTuning = {
  gravity: 110,
  speedK: 10.5,
  spin: [10, 22],
  maxFrames: 240,
  dampingBoostFrame: 170,
  herdSpeed: 10,
  linearDamping: 0.15,
  angularDamping: 0.25,
};

const GROUP_DIE = 1;
const GROUP_FLOOR = 2;
const GROUP_WALL = 4;

interface Wall {
  /** Point on the wall (x, z) and inward unit normal (x, z). */
  p: XZ;
  n: XZ;
}

function arenaWalls(a: Arena): Wall[] {
  const pts: XZ[] = [a.nearLeft, a.nearRight, a.farRight, a.farLeft];
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % 4]!;
    let nx = -(q[1] - p[1]);
    let nz = q[0] - p[0];
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if ((cx - p[0]) * nx + (cz - p[1]) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { p, n: [nx, nz] as XZ };
  });
}

/** Smallest signed distance to the walls (positive = inside). */
function insideDistance(walls: readonly Wall[], x: number, z: number): number {
  let m = Infinity;
  for (const w of walls) m = Math.min(m, (x - w.p[0]) * w.n[0] + (z - w.p[1]) * w.n[1]);
  return m;
}

function randomQuat(rng: () => number): Quat {
  const u1 = rng(), u2 = rng(), u3 = rng();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return quatNormalize([
    s1 * Math.sin(2 * Math.PI * u2),
    s1 * Math.cos(2 * Math.PI * u2),
    s2 * Math.sin(2 * Math.PI * u3),
    s2 * Math.cos(2 * Math.PI * u3),
  ]);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class DiceSimulation {
  readonly kinds: readonly DieKind[];
  readonly arena: Arena;
  readonly tuning: SimTuning;

  #world: World;
  #bodies: Body[] = [];
  #walls: Wall[];
  #wallsOn: boolean[];
  #frames: Float32Array;
  #frame = 0;
  #done = false;
  #settled = false;
  #events = new Map<string, SimEvent>();
  #floor: Body;
  #wallBodies = new Set<Body>();
  #center: XZ;

  constructor(kinds: readonly DieKind[], arena: Arena, rng: () => number = Math.random, tuning: SimTuning = DEFAULT_TUNING) {
    this.kinds = kinds;
    this.arena = arena;
    this.tuning = tuning;
    this.#walls = arenaWalls(arena);
    this.#center = [
      (arena.nearLeft[0] + arena.nearRight[0] + arena.farRight[0] + arena.farLeft[0]) / 4,
      (arena.nearLeft[1] + arena.nearRight[1] + arena.farRight[1] + arena.farLeft[1]) / 4,
    ];
    this.#wallsOn = kinds.map(() => false);
    const n = kinds.length;
    // + snap frames headroom
    this.#frames = new Float32Array((tuning.maxFrames + 1 + 40) * n * STRIDE);

    const world = new World({ gravity: new CVec3(0, -tuning.gravity, 0), allowSleep: true });
    world.quatNormalizeFast = false;
    world.quatNormalizeSkip = 0;
    this.#world = world;

    const diceMat = new Material('dice');
    const floorMat = new Material('floor');
    const wallMat = new Material('wall');
    world.addContactMaterial(new ContactMaterial(diceMat, floorMat, { friction: 0.32, restitution: 0.32 }));
    world.addContactMaterial(new ContactMaterial(diceMat, diceMat, { friction: 0.18, restitution: 0.42 }));
    world.addContactMaterial(new ContactMaterial(diceMat, wallMat, { friction: 0.08, restitution: 0.55 }));

    const floor = new Body({ mass: 0, type: Body.STATIC, material: floorMat });
    floor.addShape(new Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    floor.collisionFilterGroup = GROUP_FLOOR;
    floor.collisionFilterMask = GROUP_DIE;
    world.addBody(floor);
    this.#floor = floor;

    for (const w of this.#walls) {
      const b = new Body({ mass: 0, type: Body.STATIC, material: wallMat });
      b.addShape(new Plane());
      b.quaternion.setFromVectors(new CVec3(0, 0, 1), new CVec3(w.n[0], 0, w.n[1]));
      b.position.set(w.p[0], 0, w.p[1]);
      b.collisionFilterGroup = GROUP_WALL;
      b.collisionFilterMask = GROUP_DIE;
      world.addBody(b);
      this.#wallBodies.add(b);
    }

    this.#spawn(diceMat, rng);
    this.#record();
  }

  #spawn(diceMat: Material, rng: () => number): void {
    const { kinds, arena, tuning } = this;
    const n = kinds.length;
    const walls = this.#walls;
    const pts = [arena.nearLeft, arena.nearRight, arena.farRight, arena.farLeft];
    const cx = (pts[0]![0] + pts[1]![0] + pts[2]![0] + pts[3]![0]) / 4;
    const cz = (pts[0]![1] + pts[1]![1] + pts[2]![1] + pts[3]![1]) / 4;
    const corner = arena.nearRight;
    let ox = corner[0] - cx;
    let oz = corner[1] - cz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;

    // Random landing zone in the centre-left of the visible area (bilinear in the trapezoid).
    const s = lerp(0.22, 0.6, rng());
    const t = lerp(0.25, 0.68, rng());
    const farX = lerp(arena.farLeft[0], arena.farRight[0], s);
    const nearX = lerp(arena.nearLeft[0], arena.nearRight[0], s);
    const tx = lerp(farX, nearX, t);
    const tz = lerp(arena.farLeft[1], arena.nearLeft[1], t);

    // Cluster layout perpendicular to the throw direction.
    let dx = tx - corner[0];
    let dz = tz - corner[1];
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    const px = -dz;
    const pz = dx;
    const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 2.6))));
    const spacing = 2.35;
    const local: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const col = i % cols;
      const lat = (col - (inRow - 1) / 2) * spacing + (rng() - 0.5) * 0.4;
      const back = row * spacing + (rng() - 0.5) * 0.4 + (row % 2) * 0.3;
      local.push({ x: px * lat - dx * back, z: pz * lat - dz * back, y: 1.6 + rng() * 1.5 + row * 0.25 });
    }
    // Push the whole cluster outwards until every die starts fully off-screen.
    let shift = 1.5;
    const outside = (k: number): boolean =>
      local.every((p) => insideDistance(walls, corner[0] + ox * k + p.x, corner[1] + oz * k + p.z) < -1.3);
    while (!outside(shift) && shift < 60) shift += 0.5;

    const dist = Math.hypot(tx - (corner[0] + ox * shift), tz - (corner[1] + oz * shift));
    const baseSpeed = tuning.speedK * Math.sqrt(dist);

    kinds.forEach((kind, i) => {
      const shape = getShape(kind);
      const poly = new ConvexPolyhedron({
        vertices: shape.vertices.map((v) => new CVec3(v[0], v[1], v[2])),
        faces: shape.faces.map((f) => f.slice()),
        normals: shape.faceNormals.map((v) => new CVec3(v[0], v[1], v[2])),
        axes: shape.uniqueAxes.map((v) => new CVec3(v[0], v[1], v[2])),
      });
      const body = new Body({
        mass: 1,
        material: diceMat,
        linearDamping: tuning.linearDamping,
        angularDamping: tuning.angularDamping,
        allowSleep: true,
        sleepSpeedLimit: 0.35,
        sleepTimeLimit: 0.22,
      });
      body.addShape(poly);
      body.collisionFilterGroup = GROUP_DIE;
      body.collisionFilterMask = GROUP_DIE | GROUP_FLOOR;
      const p = local[i]!;
      body.position.set(corner[0] + ox * shift + p.x, p.y, corner[1] + oz * shift + p.z);
      const q = randomQuat(rng);
      body.quaternion.set(q[0], q[1], q[2], q[3]);

      const jitter = (rng() - 0.5) * 0.2;
      const cj = Math.cos(jitter), sj = Math.sin(jitter);
      const vx = dx * cj - dz * sj;
      const vz = dx * sj + dz * cj;
      const speed = baseSpeed * lerp(0.88, 1.12, rng());
      body.velocity.set(vx * speed, lerp(-1, 2.5, rng()), vz * speed);
      const axis = normalize([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
      const w = lerp(tuning.spin[0], tuning.spin[1], rng());
      body.angularVelocity.set(axis[0] * w, axis[1] * w, axis[2] * w);

      body.addEventListener('collide', (e: { body: Body; contact: { getImpactVelocityAlongNormal(): number } }) => {
        const other = e.body;
        let target: ContactTarget;
        if (other === this.#floor) target = 'floor';
        else if (this.#wallBodies.has(other)) target = 'wall';
        else {
          target = 'die';
          const j = this.#bodies.indexOf(other);
          if (j >= 0 && j < i) return; // count die/die pairs once
        }
        const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
        const key = `${this.#frame + 1}:${i}:${target}`;
        const prev = this.#events.get(key);
        if (!prev || prev.speed < speed) this.#events.set(key, { frame: this.#frame + 1, die: i, target, speed });
      });

      this.#world.addBody(body);
      this.#bodies.push(body);
    });
  }

  #record(): void {
    const n = this.#bodies.length;
    const base = this.#frame * n * STRIDE;
    const f = this.#frames;
    this.#bodies.forEach((b, i) => {
      const o = base + i * STRIDE;
      f[o] = b.position.x;
      f[o + 1] = b.position.y;
      f[o + 2] = b.position.z;
      f[o + 3] = b.quaternion.x;
      f[o + 4] = b.quaternion.y;
      f[o + 5] = b.quaternion.z;
      f[o + 6] = b.quaternion.w;
    });
  }

  get done(): boolean {
    return this.#done;
  }

  /** Advance one frame. Returns true when the simulation has finished. */
  step(): boolean {
    if (this.#done) return true;
    const { tuning } = this;
    // Enable the walls for a die once it is fully inside the visible area; dice that
    // are still off-screen after a short while get herded in (never visible).
    const [cx, cz] = this.#center;
    this.#bodies.forEach((b, i) => {
      if (this.#wallsOn[i]) return;
      const r = getShape(this.kinds[i]!).radius;
      if (insideDistance(this.#walls, b.position.x, b.position.z) > r * 1.02) {
        this.#wallsOn[i] = true;
        b.collisionFilterMask = GROUP_DIE | GROUP_FLOOR | GROUP_WALL;
      } else if (this.#frame > 24) {
        let ix = cx - b.position.x;
        let iz = cz - b.position.z;
        const l = Math.hypot(ix, iz) || 1;
        ix /= l;
        iz /= l;
        const along = b.velocity.x * ix + b.velocity.z * iz;
        const want = tuning.herdSpeed;
        if (along < want) {
          b.velocity.x += (want - along) * ix;
          b.velocity.z += (want - along) * iz;
          b.wakeUp();
        }
      }
    });
    if (this.#frame === tuning.dampingBoostFrame) {
      for (const b of this.#bodies) {
        b.linearDamping = 0.6;
        b.angularDamping = 0.6;
      }
    }
    this.#world.step(SIM_DT);
    this.#frame++;
    this.#record();
    const allAsleep = this.#bodies.every((b) => b.sleepState === Body.SLEEPING);
    if (allAsleep) this.#settled = true;
    if (allAsleep || this.#frame >= tuning.maxFrames) this.#done = true;
    return this.#done;
  }

  /** Step until finished or until `deadline` (performance.now() ms) is reached. */
  run(deadline = Infinity): boolean {
    while (!this.#done) {
      this.step();
      if (performance.now() >= deadline) break;
    }
    return this.#done;
  }

  /** Post-process: snap every die flat onto its up feature, score the throw. */
  result(): SimResult {
    const n = this.#bodies.length;
    const frames = this.#frames;
    const lastFrame = this.#frame;
    const walls = this.#walls;
    const landed: number[] = [];
    const finalQuats: Quat[] = [];
    let outside = 0;
    let stacked = 0;
    let cocked = 0;

    interface Snap { from: Quat; to: Quat; fy: number; ty: number; frames: number }
    const snaps: Snap[] = [];
    let snapFrames = 0;
    for (let i = 0; i < n; i++) {
      const o = lastFrame * n * STRIDE + i * STRIDE;
      const x = frames[o]!, y = frames[o + 1]!, z = frames[o + 2]!;
      const q: Quat = quatNormalize([frames[o + 3]!, frames[o + 4]!, frames[o + 5]!, frames[o + 6]!]);
      const shape = getShape(this.kinds[i]!);
      const up = findUpFeature(shape.features, q);
      landed.push(up.index);
      const w = normalize(quatRotate(q, shape.features[up.index]!));
      const fix = quatFromUnitVectors(w, [0, 1, 0]);
      const to = quatNormalize(quatMultiply(fix, q));
      finalQuats.push(to);
      const onFloor = y < shape.inradius + 0.4;
      const ty = onFloor ? shape.inradius : y;
      if (!onFloor) stacked++;
      if (up.alignment < Math.cos((14 * Math.PI) / 180)) cocked++;
      if (insideDistance(walls, x, z) < 0.15) outside++;
      const angle = Math.acos(Math.min(1, up.alignment));
      const frs = angle < 0.004 && Math.abs(ty - y) < 0.004 ? 0 : Math.max(6, Math.min(24, Math.round((angle * 180) / Math.PI / 2.5)));
      snapFrames = Math.max(snapFrames, frs);
      snaps.push({ from: q, to, fy: y, ty, frames: frs });
    }

    // Append the snap frames (dice that need no correction simply hold).
    const total = lastFrame + 1 + snapFrames;
    for (let k = 1; k <= snapFrames; k++) {
      const fi = lastFrame + k;
      for (let i = 0; i < n; i++) {
        const src = lastFrame * n * STRIDE + i * STRIDE;
        const dst = fi * n * STRIDE + i * STRIDE;
        const s = snaps[i]!;
        const tt = s.frames === 0 ? 1 : Math.min(1, k / s.frames);
        const e = tt * tt * (3 - 2 * tt);
        const q = quatSlerp(s.from, s.to, e);
        frames[dst] = frames[src]!;
        frames[dst + 1] = lerp(s.fy, s.ty, e);
        frames[dst + 2] = frames[src + 2]!;
        frames[dst + 3] = q[0];
        frames[dst + 4] = q[1];
        frames[dst + 5] = q[2];
        frames[dst + 6] = q[3];
      }
    }
    if (snapFrames === 0) {
      // Still write the exact snapped orientation into the final frame.
      for (let i = 0; i < n; i++) {
        const o = lastFrame * n * STRIDE + i * STRIDE;
        const s = snaps[i]!;
        frames[o + 1] = s.ty;
        frames[o + 3] = s.to[0];
        frames[o + 4] = s.to[1];
        frames[o + 5] = s.to[2];
        frames[o + 6] = s.to[3];
      }
    }

    const quality = outside * 100 + stacked * 8 + cocked * 4 + (this.#settled ? 0 : 3);
    const events = [...this.#events.values()].sort((a, b) => a.frame - b.frame);
    return {
      frames: frames.slice(0, total * n * STRIDE),
      frameCount: total,
      dieCount: n,
      events,
      landed,
      finalQuats,
      quality,
      stats: { simFrames: lastFrame, settled: this.#settled, outside, stacked, cocked },
    };
  }
}

/** Convenience: simulate synchronously, retrying a few throws and keeping the best one. */
export function simulateBest(
  kinds: readonly DieKind[],
  arena: Arena,
  rng: () => number = Math.random,
  attempts = 3,
  tuning: SimTuning = DEFAULT_TUNING,
): SimResult {
  let best: SimResult | null = null;
  for (let a = 0; a < attempts; a++) {
    const sim = new DiceSimulation(kinds, arena, rng, tuning);
    sim.run();
    const r = sim.result();
    if (!best || r.quality < best.quality) best = r;
    if (r.quality === 0) break;
  }
  return best!;
}

/** Read one die's pose from a recording. */
export function readPose(r: SimResult, frame: number, die: number, outPos: Vec3, outQuat: Quat): void {
  const f = Math.max(0, Math.min(r.frameCount - 1, frame));
  const o = (f * r.dieCount + die) * STRIDE;
  outPos[0] = r.frames[o]!;
  outPos[1] = r.frames[o + 1]!;
  outPos[2] = r.frames[o + 2]!;
  outQuat[0] = r.frames[o + 3]!;
  outQuat[1] = r.frames[o + 4]!;
  outQuat[2] = r.frames[o + 5]!;
  outQuat[3] = r.frames[o + 6]!;
}
