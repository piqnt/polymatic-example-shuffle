import type { Namespace } from "socket.io";

import { type ShuffleContext } from "../shuffle/ShuffleContext";
import type { Room } from "../lobby-server/LobbyServer";

export interface Auth {
  id: string;
  secret: string;
}

export interface ServerContext extends ShuffleContext {
  io: Namespace | null;
  room?: Room;

  auths: Auth[];
}
