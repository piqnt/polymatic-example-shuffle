import { Middleware } from "polymatic";

import {
  type Color,
  type FrameLoopEvent,
  type Point,
  type Puck,
  type ShuffleContext,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  other,
} from "./ShuffleContext";
import { PUCK_DAMPING, PUCK_DENSITY, PUCK_RESTITUTION } from "./Physics";

// the hardest a player can shoot, MAX_DRAG times SHOOT_STRENGTH in Terminal
const MAX_IMPULSE = 9.6;
// how long the computer looks at the board, then lines the shot up, in seconds
const THINK_TIME = 0.6;
const AIM_TIME = 0.7;
// how far off its aim the computer may be, in radians
const AIM_ERROR = 0.08;
// gap kept between a shot's path and the pucks it should miss
const CLEARANCE = 0.05;

interface Plan {
  key: string;
  impulse: Point;
  // seconds since the turn started
  t: number;
}

const smooth = (u: number) => {
  u = Math.max(0, Math.min(1, u));
  return u * u * (3 - 2 * u);
};

/**
 * The computer player, offline. On its turn it picks a puck to shoot, then pulls it back where you can see, and
 * shoots. Physics, rendering and network agnostic: it reads the pucks and emits the same shot a player would.
 *
 * It looks for an opponent's puck it can knock straight off the board, without anything in the way and without its
 * own puck following it off. When there is none, it hits the nearest opponent's puck it can reach.
 */
export class Computer extends Middleware<ShuffleContext> {
  plan: Plan | null = null;

  constructor() {
    super();
    this.on("frame-update", this.handleFrameUpdate);
  }

  handleFrameUpdate = (ev: FrameLoopEvent) => {
    const context = this.context;
    const { computer, started, winner, moving, turn, pucks } = context;
    if (!computer || !started || winner || moving || turn !== computer) {
      this.plan = null;
      context.computerAim = null;
      return;
    }

    if (!this.plan || !pucks.some((p) => p.key === this.plan.key)) {
      this.plan = { ...this.think(pucks, computer), t: 0 };
    }
    const plan = this.plan;
    plan.t += ev.dt / 1000;

    // pulls back from nothing to the shot
    const u = smooth((plan.t - THINK_TIME) / AIM_TIME);
    context.computerAim = u > 0 ? { key: plan.key, impulse: { x: plan.impulse.x * u, y: plan.impulse.y * u } } : null;

    if (plan.t > THINK_TIME + AIM_TIME + 0.2) {
      this.plan = null;
      context.computerAim = null;
      this.emit("user-shoot", { key: plan.key, impulse: plan.impulse });
    }
  };

  think(pucks: Puck[], color: Color): { key: string; impulse: Point } {
    const own = pucks.filter((p) => p.color === color);
    const opponents = pucks.filter((p) => p.color === other(color));

    const mass = (puck: Puck) => PUCK_DENSITY * Math.PI * puck.radius ** 2;

    let best: { score: number; puck: Puck; angle: number; speed: number } | null = null;
    for (const puck of own) {
      for (const target of opponents) {
        for (const shot of knockOuts(puck, target, pucks, MAX_IMPULSE / mass(puck))) {
          if (!best || shot.score > best.score) best = { ...shot, puck };
        }
      }
    }

    if (!best) {
      best = nudge(own, opponents, pucks);
    }

    const angle = best.angle + (Math.random() - 0.5) * 2 * AIM_ERROR;
    const impulse = Math.min(MAX_IMPULSE, best.speed * mass(best.puck));
    return { key: best.puck.key, impulse: { x: Math.cos(angle) * impulse, y: Math.sin(angle) * impulse } };
  }
}

/**
 * Ways to knock the target off the board with the puck: straight off each of the four edges, or on along the line
 * from the puck. Each is a cut shot, the puck hits the target where it sends it the chosen way. Shots that are blocked,
 * too thin, too long for the fastest the puck can go, or would put the puck itself off are left out.
 */
function knockOuts(puck: Puck, target: Puck, pucks: Puck[], maxSpeed: number) {
  const shots: { score: number; angle: number; speed: number }[] = [];
  const contact = puck.radius + target.radius;
  const directions: Point[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    unit(target.x - puck.x, target.y - puck.y),
  ];
  for (const dir of directions) {
    // where the puck is when it touches the target
    const ghost = { x: target.x - dir.x * contact, y: target.y - dir.y * contact };
    const lx = ghost.x - puck.x;
    const ly = ghost.y - puck.y;
    const length = Math.hypot(lx, ly);
    if (length < 0.01) continue;
    const cos = (lx * dir.x + ly * dir.y) / length;
    if (cos < 0.4) continue;

    // how far the target has to go to touch the edge
    const out = toEdge(target, dir);
    const others = pucks.filter((p) => p !== puck && p !== target);
    if (others.some((p) => segmentDistance(p, puck, ghost) < p.radius + puck.radius + CLEARANCE)) continue;
    const exit = { x: target.x + dir.x * out, y: target.y + dir.y * out };
    if (others.some((p) => segmentDistance(p, target, exit) < p.radius + target.radius + CLEARANCE)) continue;

    // enough speed for the target to go off, with some to spare, and to bring the puck there
    const hit = (PUCK_DAMPING * out * 1.4 + 2) / (cos * (1 + PUCK_RESTITUTION) * 0.5);
    const speed = hit + PUCK_DAMPING * length;
    if (speed > maxSpeed) continue;

    // the puck keeps the sideways part of its speed, and must stop before the edge
    const sin = Math.sqrt(1 - cos * cos);
    if (sin > 0.05) {
      const side = unit(lx / length - cos * dir.x, ly / length - cos * dir.y);
      const travel = (hit * sin) / PUCK_DAMPING;
      if (travel + 0.3 > toEdge({ ...ghost, radius: puck.radius }, side)) continue;
    }

    const score = (cos * cos) / (1 + 0.06 * (length + out));
    shots.push({ score, angle: Math.atan2(ly, lx), speed });
  }
  return shots;
}

/**
 * Nothing can be knocked off: hit the nearest opponent's puck straight on, softly, to move it toward an edge. And
 * with nothing in reach at all, a small push toward the middle.
 */
function nudge(own: Puck[], opponents: Puck[], pucks: Puck[]) {
  let best: { score: number; puck: Puck; angle: number; speed: number } | null = null;
  for (const puck of own) {
    for (const target of opponents) {
      const others = pucks.filter((p) => p !== puck && p !== target);
      if (others.some((p) => segmentDistance(p, puck, target) < p.radius + puck.radius + CLEARANCE)) continue;
      const distance = Math.hypot(target.x - puck.x, target.y - puck.y);
      const score = -distance;
      if (!best || score > best.score) {
        const angle = Math.atan2(target.y - puck.y, target.x - puck.x);
        best = { score, puck, angle, speed: PUCK_DAMPING * distance + 6 };
      }
    }
  }
  if (best) return best;
  const puck = own[0];
  return { score: 0, puck, angle: Math.atan2(-puck.y, -puck.x), speed: 2 };
}

/** How far a puck can go the given way before it touches the edge, and is out. */
function toEdge(puck: Point & { radius: number }, dir: Point) {
  const w = BOARD_WIDTH / 2 - puck.radius;
  const h = BOARD_HEIGHT / 2 - puck.radius;
  const tx = dir.x > 0 ? (w - puck.x) / dir.x : dir.x < 0 ? (-w - puck.x) / dir.x : Infinity;
  const ty = dir.y > 0 ? (h - puck.y) / dir.y : dir.y < 0 ? (-h - puck.y) / dir.y : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

function unit(x: number, y: number): Point {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** Distance from a point to the segment from a to b. */
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-9)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}
