import { Middleware, Runtime } from "polymatic";

import { Board } from "../shuffle/Board";
import { Physics } from "../shuffle/Physics";
import { FixedLoop } from "./FixedLoop";
import { RoomServer } from "./RoomServer";
import { type ServerContext } from "./ServerContext";

/**
 * Game server for one room: runs the rules and physics, and syncs them with the clients in the room.
 */
export class MainServer extends Middleware<ServerContext> {
  constructor() {
    super();

    this.use(new FixedLoop());
    this.use(new Board());
    this.use(new Physics());
    this.use(new RoomServer());

    this.on("terminate-room", this.handleTerminateRoom);
  }

  handleTerminateRoom = () => {
    Runtime.deactivate(this);
  };
}
