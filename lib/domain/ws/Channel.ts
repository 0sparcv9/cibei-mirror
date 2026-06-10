import { StatefulWebSocket } from "./StatefulSocket.ts";

const channelIds: Set<number> = new Set();

export default class Channel extends EventTarget {
  private socketId: number = 0;

  private initSocketId() {
    let socketId;

    do {
      socketId = Math.floor(Math.random() * 255);
    } while (channelIds.has(socketId));

    this.socketId = socketId;

    channelIds.add(socketId);
  }

  public getSocketID() {
    return this.socketId;
  }

  public sendPacket(packet: Uint8Array) {
    this.socket.send(
      new Uint8Array([this.socketId, ...packet]),
    );
  }

  public onPacketCallback?: (packet: Uint8Array) => void;

  public onPacketListener({ data }: MessageEvent) {
    const [socketId, ...packet] = new Uint8Array(data);

    const buffer = new Uint8Array(packet);

    if (new TextDecoder().decode(buffer) === "__close__") {
      console.log("[Ladder] Closing Channel " + socketId);

      this.dispatchEvent(new Event("close"));

      return;
    }

    if (socketId === this.socketId && this.onPacketCallback) {
      this.onPacketCallback(buffer);
    }
  }

  public onPacket(callback: (packet: Uint8Array) => void) {
    this.onPacketCallback = callback;

    const listener = this.onPacketListener.bind(this);

    this.socket.addEventListener("message",
      listener,
      { passive: true }
    );

    this.socket.addEventListener("close", () => {
      this.socket.removeEventListener("message", listener);

      console.log("Removed message listener on global socket close " + this.socketId);
    }, { once: true });

    this.addEventListener("close", () => {
      this.socket.removeEventListener("message", listener);

      console.log("Removed message listener on socket cleanup " + this.socketId);
    }, { once: true });
  }

  constructor(
    private readonly socket: StatefulWebSocket
  ) {
    super();

    this.initSocketId();
  }
}
