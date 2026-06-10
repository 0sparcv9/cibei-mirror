import { StatefulWebSocket } from "./StatefulSocket.ts";

const channelIds: Set<number> = new Set();

export default class Channel extends EventTarget {
  private readonly socket: StatefulWebSocket;

  private autodetectChannelID: boolean = false;

  private socketId: number = 0;

  private initSocketId() {
    let socketId;

    while (!channelIds.has(socketId = Math.floor(Math.random() * 255))) {
      this.socketId = socketId;

      channelIds.add(socketId);
    }
  }

  public getSocketID() {
    return this.socketId;
  }

  public setAutodetectChannelID() {
    this.autodetectChannelID = true;
    this.socketId = 0;
  }

  public sendPacket(packet: Uint8Array) {
    this.socket.send(
      new Uint8Array([this.socketId, ...packet]),
    );
  }

  public onPacket(callback: (packet: Uint8Array) => void) {
    this.socket.addEventListener("message", ({ data }) => {
      const [socketId, ...packet] = new Uint8Array(data);

      if (this.autodetectChannelID) {
        this.autodetectChannelID = false;
        this.socketId = socketId;
      }

      if (socketId === this.socketId) {
        callback(new Uint8Array(packet));
      }
    }, { passive: true });
  }

  constructor(socket: StatefulWebSocket) {
    super();

    this.socket = socket;

    this.initSocketId();
  }
}
