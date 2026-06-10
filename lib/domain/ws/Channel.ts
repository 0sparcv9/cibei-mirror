import { StatefulWebSocket } from "./StatefulSocket.ts";

const channelIds: Set<number> = new Set();

enum ControlTypes {
  SocketData,
  SocketClose
}

export default class Channel extends EventTarget {
  private readonly socket: StatefulWebSocket;

  private socketId: number = 0;

  private initSocketId() {
    let socketId;

    while (!channelIds.has(socketId = Math.floor(Math.random() * 255))) {
      this.socketId = socketId;

      channelIds.add(socketId);
    }
  }

  private sendMessage(packet: Uint8Array) {
    this.socket.send(
      new Uint8Array([this.socketId, ...packet]),
    );
  }

  constructor(socket: StatefulWebSocket) {
    super();

    this.socket = socket;

    this.initSocketId();
  }
}
