import { Middleware } from "polymatic";

import { Board } from "../shuffle/Board";
import { Computer } from "../shuffle/Computer";
import { Physics } from "../shuffle/Physics";
import { FrameLoop } from "./FrameLoop";
import { PixiManager } from "./PixiManager";
import { Status } from "./Status";
import { Terminal } from "./Terminal";
import { type ClientContext } from "./ClientContext";

/**
 * Offline game: two players take turns on this device, or one plays the computer when the context names its team.
 */
export class MainOffline extends Middleware<ClientContext> {
  constructor() {
    super();
    this.use(new FrameLoop());
    this.use(new PixiManager());
    this.use(new Board());
    this.use(new Physics());
    this.use(new Computer());
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
