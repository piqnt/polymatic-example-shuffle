import { Container, Graphics, Sprite, type FederatedPointerEvent, type Texture } from "pixi.js";

import { Binder, Driver, Middleware } from "polymatic";

import { type ClientContext, canShoot } from "./ClientContext";
import { type Entity, type Point, type Puck, type Wall, BOARD_HEIGHT, BOARD_WIDTH } from "../shuffle/ShuffleContext";
import { BOARD_RESOLUTION, makeBoardTexture, makePuckTexture, makeShineTexture } from "./Textures";

const VIEW_WIDTH = BOARD_WIDTH * 1.15;
const VIEW_HEIGHT = BOARD_HEIGHT * 1.15;

// impulse per world unit of drag
const SHOOT_STRENGTH = 1.6;
// pointer can grab a puck a bit outside its edge, for touch
const GRAB_MARGIN = 0.2;
// a shorter drag is taken as a change of mind, and a longer one is capped, in world units
const MIN_DRAG = 0.2;
const MAX_DRAG = 6;
// pixi picks a circle's segment count from its radius in local units, which is tiny in world units,
// so circles are drawn larger and the graphics scaled back down
const CURVE_SCALE = 100;

const LINE_WIDTH = 0.04;
const COLORS = {
  red: 0xff411a,
  blue: 0x0077ff,
};

/** Textured puck: the body rotates with physics, the shine on top stays lit from the same side. */
interface Disc {
  view: Container;
  body: Sprite;
  light: Sprite;
  // marks the team whose turn it is
  ring: Graphics;
}

/**
 * Terminal: renders game data with Pixi, and reads pointer input. Drag a puck and release to shoot it
 * in the opposite direction, like a slingshot.
 */
export class Terminal extends Middleware<ClientContext> {
  // pucks, between the board and the aim line
  layer: Container;
  aim: Graphics;

  // shared by all pucks, the board texture is owned by its view
  puckTextures: Record<Puck["color"], Texture>;
  shine: Texture;

  // puck being aimed, and pointer position in world coordinates
  aimKey: string | null = null;
  pointer: Point = { x: 0, y: 0 };

  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("deactivate", this.handleDeactivate);
    this.on("frame-render", this.handleFrameRender);
  }

  handleActivate = () => {
    const pixi = this.context.pixi;

    pixi.renderer.on("resize", this.handleViewport);
    this.handleViewport();

    this.puckTextures = { red: makePuckTexture(COLORS.red), blue: makePuckTexture(COLORS.blue) };
    this.shine = makeShineTexture();

    this.layer = new Container();
    this.aim = new Graphics();
    this.context.scene.addChild(this.layer, this.aim);

    pixi.stage.eventMode = "static";
    pixi.stage.hitArea = pixi.screen;
    pixi.stage.on("pointerdown", this.handlePointerDown);
    pixi.stage.on("globalpointermove", this.handlePointerMove);
    pixi.stage.on("pointerup", this.handlePointerUp);
    pixi.stage.on("pointerupoutside", this.handlePointerUp);

    document.addEventListener("keydown", this.handleKeydown);
  };

  handleDeactivate = () => {
    const pixi = this.context.pixi;
    pixi?.renderer.off("resize", this.handleViewport);
    pixi?.stage.removeAllListeners();
    document.removeEventListener("keydown", this.handleKeydown);

    for (const texture of [this.puckTextures?.red, this.puckTextures?.blue, this.shine]) {
      texture?.destroy(true);
    }
  };

  /**
   * Fit the board inside the screen, center the origin, and flip y-axis to point up like physics.
   * On a portrait screen the board is turned a quarter, so it stays the long way round.
   */
  handleViewport = () => {
    const pixi = this.context.pixi;
    const scene = this.context.scene;

    const screenWidth = pixi.screen.width;
    const screenHeight = pixi.screen.height;

    const portrait = screenHeight > screenWidth;
    const viewWidth = portrait ? VIEW_HEIGHT : VIEW_WIDTH;
    const viewHeight = portrait ? VIEW_WIDTH : VIEW_HEIGHT;

    const scale = Math.min(screenWidth / viewWidth, screenHeight / viewHeight);
    scene.scale.set(scale, -scale);
    scene.rotation = portrait ? Math.PI / 2 : 0;
    scene.position.set(screenWidth / 2, screenHeight / 2);
  };

  toWorld(ev: FederatedPointerEvent): Point {
    const p = this.context.scene.toLocal(ev.global);
    return { x: p.x, y: p.y };
  }

  /** Puck being aimed, if it can still be shot. */
  aimed(): Puck | null {
    const puck = this.context.pucks?.find((p) => p.key === this.aimKey);
    return puck && canShoot(this.context, puck.color) ? puck : null;
  }

  handlePointerDown = (ev: FederatedPointerEvent) => {
    if (this.context.winner) {
      this.restart();
      return;
    }
    const point = this.toWorld(ev);
    const pucks = this.context.pucks?.filter((p) => canShoot(this.context, p.color)) ?? [];
    this.aimKey = findPuck(pucks, point)?.key ?? null;
    this.pointer = point;
  };

  handlePointerMove = (ev: FederatedPointerEvent) => {
    if (!this.aimKey) return;
    this.pointer = this.toWorld(ev);
  };

  handlePointerUp = (ev: FederatedPointerEvent) => {
    const puck = this.aimed();
    this.aimKey = null;
    if (!puck) return;

    const drag = this.drag(puck, this.toWorld(ev));
    if (Math.hypot(drag.x, drag.y) < MIN_DRAG) return;
    const impulse = { x: drag.x * SHOOT_STRENGTH, y: drag.y * SHOOT_STRENGTH };
    this.emit("user-shoot", { key: puck.key, impulse });
  };

  /** From the pointer back to the puck, capped at MAX_DRAG. */
  drag(puck: Puck, point: Point): Point {
    const x = puck.x - point.x;
    const y = puck.y - point.y;
    const k = Math.min(1, MAX_DRAG / (Math.hypot(x, y) || 1));
    return { x: x * k, y: y * k };
  }

  handleKeydown = (e: KeyboardEvent) => {
    if (e.code === "Space" && this.context.winner) {
      e.preventDefault();
      this.restart();
    }
  };

  /** Offline anyone at the table may restart, online only the two playing. */
  restart() {
    const { room, me } = this.context;
    if (!room || me?.color) this.emit("user-restart");
  }

  handleFrameRender = () => {
    const { wall, pucks } = this.context;
    if (!wall || !pucks) return;
    this.binder.setData([wall, ...pucks]);

    this.aim.clear();
    const puck = this.aimed();
    if (puck) {
      this.drawAim(puck, this.drag(puck, this.pointer));
    } else {
      this.aimKey = null;
      // the computer's shot, drawn as if it were dragged
      const shot = this.context.computerAim;
      const aimed = shot && pucks.find((p) => p.key === shot.key);
      if (aimed) {
        this.drawAim(aimed, { x: shot.impulse.x / SHOOT_STRENGTH, y: shot.impulse.y / SHOOT_STRENGTH });
      }
    }
  };

  /** The drag back from the puck, and the way it will go. */
  drawAim(puck: Puck, drag: Point) {
    this.aim
      .moveTo(puck.x, puck.y)
      .lineTo(puck.x - drag.x, puck.y - drag.y)
      .stroke({ width: LINE_WIDTH, color: 0xffffff, alpha: 0.5 })
      .moveTo(puck.x, puck.y)
      .lineTo(puck.x + drag.x * 0.5, puck.y + drag.y * 0.5)
      .stroke({ width: LINE_WIDTH * 1.5, color: COLORS[puck.color], alpha: 0.9 });
  }

  wallDriver = Driver.create<Wall, Sprite>({
    filter: (data) => data.type === "wall",
    enter: (data) => {
      const board = makeBoardTexture(data.width, data.height);
      const sprite = new Sprite(board.texture);
      // texture is y-down, flip it back up
      sprite.position.set(board.left, board.top);
      sprite.scale.set(1 / BOARD_RESOLUTION, -1 / BOARD_RESOLUTION);
      this.context.scene.addChildAt(sprite, 0);
      return sprite;
    },
    update: (data, sprite) => {},
    exit: (data, sprite) => {
      sprite.removeFromParent();
      sprite.destroy({ texture: true, textureSource: true });
    },
  });

  puckDriver = Driver.create<Puck, Disc>({
    filter: (data) => data.type === "puck",
    enter: (data) => {
      const disc = makeDisc(this.puckTextures[data.color], this.shine, data.radius);
      this.layer.addChild(disc.view);
      return disc;
    },
    update: (data, disc) => {
      disc.view.position.set(data.x, data.y);
      disc.body.rotation = data.angle;
      // the scene turns on portrait screens, keep the light where it was
      disc.light.rotation = this.context.scene.rotation;
      disc.ring.visible = canShoot(this.context, data.color);
    },
    exit: (data, disc) => {
      disc.view.removeFromParent();
      disc.view.destroy({ children: true });
    },
  });

  binder = Binder.create<Entity>({
    key: (data) => data.key,
    drivers: [this.wallDriver, this.puckDriver],
  });
}

/** Disc of the given radius, textures are y-down so they are flipped back up. */
function makeDisc(texture: Texture, shine: Texture, radius: number): Disc {
  const body = new Sprite({ texture, anchor: 0.5 });
  body.scale.set((2 * radius) / texture.width, (-2 * radius) / texture.height);
  const light = new Sprite({ texture: shine, anchor: 0.5 });
  light.scale.set((2 * radius) / shine.width, (-2 * radius) / shine.height);
  const ring = new Graphics()
    .circle(0, 0, radius * 1.3 * CURVE_SCALE)
    .stroke({ width: LINE_WIDTH * 1.5 * CURVE_SCALE, color: 0xffffff, alpha: 0.7 });
  ring.scale.set(1 / CURVE_SCALE);
  ring.visible = false;
  const view = new Container();
  view.addChild(ring, body, light);
  return { view, body, light, ring };
}

/** Closest puck under the point. */
function findPuck(pucks: Puck[], point: Point): Puck | null {
  let best: Puck | null = null;
  let bestDist = Infinity;
  for (const puck of pucks) {
    const dist = Math.hypot(puck.x - point.x, puck.y - point.y);
    if (dist < puck.radius + GRAB_MARGIN && dist < bestDist) {
      best = puck;
      bestDist = dist;
    }
  }
  return best;
}
