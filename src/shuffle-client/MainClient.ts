import { Middleware } from "polymatic";

import { FrameLoop } from "./FrameLoop";
import { PixiManager } from "./PixiManager";
import { RoomClient } from "./RoomClient";
import { Status } from "./Status";
import { Terminal } from "./Terminal";
import { type ClientContext } from "./ClientContext";

/**
 * Online game: the server runs the rules and physics, this renders what it sends and passes user actions to it.
 */
export class MainClient extends Middleware<ClientContext> {
  constructor() {
    super();
    this.use(new FrameLoop());
    this.use(new PixiManager());
    this.use(new RoomClient());
    this.use(new Status());
    this.on("pixi-ready", this.handlePixiReady);
  }

  handlePixiReady = () => {
    this.use(new Terminal());
  };
}
