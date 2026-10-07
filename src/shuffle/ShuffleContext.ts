export const BOARD_WIDTH = 14;
export const BOARD_HEIGHT = 9;

export type Color = "red" | "blue";

export const other = (color: Color): Color => (color === "red" ? "blue" : "red");

export interface Point {
  x: number;
  y: number;
}

export interface Puck {
  key: string;
  type: "puck";
  color: Color;
  radius: number;
  // position and rotation, updated by physics
  x: number;
  y: number;
  angle: number;
  // shot to apply, consumed by physics
  impulse?: Point | null;
}

/** Board edge, pucks touching it are out. */
export interface Wall {
  key: string;
  type: "wall";
  width: number;
  height: number;
}

export type Entity = Puck | Wall;

/** Someone taking part: a person at the table offline is not one, online everyone connected is. */
export interface User {
  id: string;
  // team this user plays, none for a spectator
  color?: Color;
}

export interface FrameLoopEvent {
  dt: number;
  now: number;
}

/**
 * Game data, shared by the offline game, the server, and the online client which receives it from the server.
 */
export interface ShuffleContext {
  wall?: Wall;
  pucks?: Puck[];

  started?: boolean;
  // team to shoot next
  turn?: Color;
  // a shot was taken, and things are still moving
  moving?: boolean;
  winner?: Color | null;

  users?: User[];
}

/** Pucks left on the board, per team. */
export const countPucks = (pucks: Puck[]): Record<Color, number> => ({
  red: pucks.filter((p) => p.color === "red").length,
  blue: pucks.filter((p) => p.color === "blue").length,
});
