import { Middleware } from "polymatic";

import {
  type Color,
  type Point,
  type Puck,
  type ShuffleContext,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  countPucks,
  other,
} from "./ShuffleContext";

const PUCK_RADIUS = 0.3;
const PUCK_SPACE = 1;
const TEAM_SIZE = 8;

/**
 * Game logic: turns and knock-outs. Physics, rendering and network agnostic.
 *
 * Teams take turns shooting one of their own pucks, and a puck that touches the board edge is out. The turn passes
 * after every shot, whatever it knocked out. A team with no pucks left loses, and
 * if both run out on the same shot the shooter loses.
 */
export class Board extends Middleware<ShuffleContext> {
  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("game-start", this.handleGameStart);
    this.on("user-shoot", this.handleUserShoot);
    this.on("user-restart", this.handleUserRestart);
    this.on("game-puck-out", this.handlePuckOut);
    this.on("shot-end", this.handleShotEnd);
  }

  handleActivate = () => {
    this.context.wall = { key: "wall", type: "wall", width: BOARD_WIDTH, height: BOARD_HEIGHT };
    this.context.started = false;
    this.setup();
  };

  handleGameStart = () => {
    this.context.started = true;
    this.setup();
  };

  setup() {
    this.context.pucks = [...this.team("red", +BOARD_WIDTH * 0.4), ...this.team("blue", -BOARD_WIDTH * 0.4)];
    this.context.turn = Math.random() < 0.5 ? "red" : "blue";
    this.context.moving = false;
    this.context.winner = null;
    this.emit("update");
  }

  team(color: Color, x: number): Puck[] {
    const pucks: Puck[] = [];
    for (let j = 0; j < TEAM_SIZE; j++) {
      pucks.push({
        key: color + "-puck-" + Math.random(),
        type: "puck",
        color,
        radius: PUCK_RADIUS,
        // tiny jitter, so a perfectly aligned row does not behave like one body
        x: x + Math.random() * PUCK_RADIUS * 0.02,
        y: (j - (TEAM_SIZE - 1) * 0.5) * PUCK_SPACE + Math.random() * PUCK_RADIUS * 0.02,
        angle: Math.random() * 2 * Math.PI,
      });
    }
    return pucks;
  }

  handleUserShoot = ({ key, impulse }: { key: string; impulse: Point }) => {
    const { started, winner, moving, turn, pucks } = this.context;
    if (!started || winner || moving) return;
    const puck = pucks.find((p) => p.key === key);
    if (!puck || puck.color !== turn) return;
    puck.impulse = impulse;
    this.context.moving = true;
    this.emit("update");
  };

  handlePuckOut = ({ puck }: { puck: Puck }) => {
    const pucks = this.context.pucks;
    const index = pucks.indexOf(puck);
    if (index < 0) return;
    pucks.splice(index, 1);
    this.emit("update");
  };

  handleShotEnd = () => {
    if (!this.context.moving) return;
    this.context.moving = false;

    const opponent = other(this.context.turn);
    const after = countPucks(this.context.pucks);

    if (!after.red || !after.blue) {
      this.context.winner = after.red ? "red" : after.blue ? "blue" : opponent;
    } else {
      this.context.turn = opponent;
    }
    this.emit("update");
  };

  handleUserRestart = () => {
    if (!this.context.winner) return;
    this.emit("game-start");
  };
}
