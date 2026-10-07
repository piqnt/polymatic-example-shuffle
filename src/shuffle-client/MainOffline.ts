import { Middleware } from "polymatic";

import { Board } from "../shuffle/Board";
import { Physics } from "../shuffle/Physics";
import { FrameLoop } from "./FrameLoop";
import { PixiManager } from "./PixiManager";
import { Status } from "./Status";
import { Terminal } from "./Terminal";
import { type ClientContext } from "./ClientContext";

/**
 * Offline game: two players take turns on this device.
 */
export class MainOffline extends Middleware<ClientContext> {
  constructor() {
    super();
    this.use(new FrameLoop());
    this.use(new PixiManager());
    this.use(new Board());
    this.use(new Physics());
    this.use(new Status());
    this.on("activate", this.handleActivate);
    this.on("pixi-ready", this.handlePixiReady);
  }

  handleActivate = () => {
    this.emit("game-start");
  };

  handlePixiReady = () => {
    this.use(new Terminal());
  };
}
