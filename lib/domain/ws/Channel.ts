import { StatefulWebSocket } from "./StatefulSocket.ts";
import { Xor } from "../obfuscation/Xor.ts";

const channels: Map<number, Channel> = new Map();

addEventListener(
  "Channel::close",
  ((event: MessageEvent) => {
    console.log("Channel " + event.data + " got close control message");

    if (channels.has(event.data)) {
      const channel = channels.get(event.data)!;

      channel.dispatchEvent(new Event("close"));
    }
  }) as EventListener,
);

export default class Channel extends EventTarget {
  private socketId: number = 0;

  public setSocketId(id: number) {
    channels.delete(this.socketId);

    this.socketId = id;

    channels.set(id, this);
  }

  private initSocketId() {
    let socketId;

    do {
      socketId = Math.floor(Math.random() * 255);
    } while (channels.has(socketId));

    this.socketId = socketId;

    channels.set(socketId, this);
  }

  public getSocketID() {
    return this.socketId;
  }

  public sendPacket(packet: Uint8Array) {
    const message = Xor.apply(new Uint8Array([this.socketId, ...packet]));

    console.log("Send encrypted " + String.fromCharCode(...packet));

    this.socket.send(
      message,
    );
  }

  public onPacketCallback?: (packet: Uint8Array) => void;

  public onPacketListener({ data }: MessageEvent) {
    const bytesCopy =
      (data instanceof ArrayBuffer ? new Uint8Array(data) : data).slice();

    const [socketId, ...packet] = Xor.apply(bytesCopy);

    console.log(socketId, new Uint8Array(data)[0]);

    const buffer = new Uint8Array(packet);

    if (socketId === this.socketId && this.onPacketCallback) {
      this.onPacketCallback(buffer);
    }
  }

  public onPacket(callback: (packet: Uint8Array) => void) {
    this.onPacketCallback = callback;

    const listener = this.onPacketListener.bind(this);

    this.socket.addEventListener("message", (event) => {
      listener(
        event,
      );
    }, {
      passive: true,
    });

    this.socket.addEventListener("close", () => {
      this.socket.removeEventListener("message", listener);

      channels.delete(this.socketId);

      console.log(
        "Removed message listener on global socket close " + this.socketId,
      );
    }, { once: true });

    this.addEventListener("close", () => {
      this.socket.removeEventListener("message", listener);

      channels.delete(this.socketId);

      console.log(
        "Removed message listener on socket cleanup " + this.socketId,
      );
    }, { once: true });
  }

  constructor(
    private readonly socket: StatefulWebSocket,
  ) {
    super();

    this.initSocketId();
  }
}
