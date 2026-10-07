import { World, Circle, Chain, Settings, type Body, type Contact } from "planck";

import { Binder, Driver, Middleware } from "polymatic";

import { type Entity, type FrameLoopEvent, type Puck, type ShuffleContext, type Wall } from "./ShuffleContext";

const TIME_STEP = 1 / 60;
const MAX_FRAME_TIME = 50;
// a shot that is still going after this long is ended anyway, in ms
const MAX_SHOT_TIME = 15000;

/**
 * Physics: maps game data to bodies, steps the world, and turns collisions and rest into game events.
 */
export class Physics extends Middleware<ShuffleContext> {
  world: World;
  timeAccumulator = 0;
  shotTime = 0;

  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("frame-update", this.handleFrameUpdate);
  }

  handleActivate = () => {
    // let slow pucks bounce instead of sticking to each other
    Settings.velocityThreshold = 0;
    this.world = new World({ gravity: { x: 0, y: 0 } });
    this.world.on("begin-contact", this.handleContact);
  };

  handleFrameUpdate = (ev: FrameLoopEvent) => {
    this.binder.setData([this.context.wall, ...this.context.pucks]);

    // fixed time step
    this.timeAccumulator += Math.min(ev.dt, MAX_FRAME_TIME) / 1000;
    while (this.timeAccumulator >= TIME_STEP) {
      this.world.step(TIME_STEP);
      this.timeAccumulator -= TIME_STEP;
    }

    // copy position and rotation to game data
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const data = body.getUserData() as Entity | null;
      if (!data || data.type !== "puck") continue;
      const p = body.getPosition();
      data.x = p.x;
      data.y = p.y;
      data.angle = body.getAngle();
    }

    // a shot ends once every body has come to rest
    if (this.context.moving) {
      this.shotTime += ev.dt;
      let resting = true;
      for (let body = this.world.getBodyList(); body && resting; body = body.getNext()) {
        if (body.isDynamic() && body.isAwake()) resting = false;
      }
      if (resting || this.shotTime > MAX_SHOT_TIME) {
        this.emit("shot-end");
      }
    } else {
      this.shotTime = 0;
    }
  };

  puckDriver = Driver.create<Puck, Body>({
    filter: (data) => data.type === "puck",
    enter: (data) => this.createPuck(data),
    update: (data, body) => {
      if (data.impulse) {
        body.applyLinearImpulse(data.impulse, body.getWorldCenter(), true);
        data.impulse = null;
      }
    },
    exit: (data, body) => {
      this.world.destroyBody(body);
    },
  });

  wallDriver = Driver.create<Wall, Body>({
    filter: (data) => data.type === "wall",
    enter: (data) => this.createWall(data),
    update: (data, body) => {},
    exit: (data, body) => {
      this.world.destroyBody(body);
    },
  });

  binder = Binder.create<Entity>({
    key: (data) => data.key,
    drivers: [this.puckDriver, this.wallDriver],
  });

  createWall(data: Wall) {
    const w = data.width / 2;
    const h = data.height / 2;
    const body = this.world.createBody({
      type: "static",
      userData: data,
    });
    body.createFixture({
      shape: new Chain(
        [
          { x: -w, y: -h },
          { x: -w, y: +h },
          { x: +w, y: +h },
          { x: +w, y: -h },
        ],
        true,
      ),
      isSensor: true,
    });
    return body;
  }

  createPuck(data: Puck) {
    const body = this.world.createBody({
      type: "dynamic",
      bullet: true,
      position: { x: data.x, y: data.y },
      angle: data.angle,
      linearDamping: 1.6,
      angularDamping: 1.6,
      userData: data,
    });
    body.createFixture({
      shape: new Circle(data.radius),
      friction: 0.1,
      restitution: 0.98,
      density: 0.8,
    });
    return body;
  }

  handleContact = (contact: Contact) => {
    const dataA = contact.getFixtureA().getBody().getUserData() as Entity | null;
    const dataB = contact.getFixtureB().getBody().getUserData() as Entity | null;
    if (!dataA || !dataB) return;

    const wall = dataA.type === "wall" ? dataA : dataB.type === "wall" ? dataB : null;
    const puck = dataA.type === "puck" ? dataA : dataB.type === "puck" ? dataB : null;

    // the world is locked during a step, game events are handled later
    if (puck && wall) {
      this.emit("game-puck-out", { puck });
    }
  };
}
