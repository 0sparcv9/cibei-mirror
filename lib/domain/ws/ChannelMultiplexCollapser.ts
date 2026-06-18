import { Xor } from "../obfuscation/Xor.ts";
import { StatefulWebSocket } from "./StatefulSocket.ts";

export enum ControlMessage {
  Close,
}

export class SingleDestinationChannel {
  public onPacketCallback?: (
    socketId: number,
    packet: Uint8Array<ArrayBuffer>,
  ) => void = undefined;

  onPacket(callback: (socketId: number, packet: Uint8Array) => void) {
    this.onPacketCallback = callback;
  }

  public sendPacket(socketId: number, packet: Uint8Array) {
    if (!this?.controller?.mainSocket) {
      return;
    }

    this.controller.mainSocket.send(
      Xor.apply(new Uint8Array([socketId, ...packet])),
    );
  }

  public sendControlMessage(socketId: number, message: ControlMessage) {
    if (!this?.controller?.mainSocket) {
      return;
    }

    console.log("Sending control Message " + message + " to " + socketId);

    this.controller.mainSocket!.send(
      Xor.apply(new Uint8Array([0, socketId, message])),
    );
  }

  constructor(
    private controller: ChannelMultiplexCollapser,
  ) {}
}

export class ChannelMultiplexCollapser extends EventTarget {
  private readonly channels: SingleDestinationChannel[] = [];

  constructor(
    public mainSocket: StatefulWebSocket,
  ) {
    super();

    const listener = ({ data }: MessageEvent) => {
      const [socketId, ...packet] = Xor.apply(new Uint8Array(data));

      console.log(String.fromCharCode(...packet));

      this.channels.forEach((channel) => {
        if (channel?.onPacketCallback) {
          console.log(
            "Foudn packet callacxk",
          );
          channel.onPacketCallback(socketId, new Uint8Array(packet));
        }
      });
    };

    if (!this.mainSocket) throw new Error("No main socket");

    this.mainSocket.addEventListener("message", listener);

    this.mainSocket.addEventListener("close", () => {
      this.channels.length = 0;

      this.mainSocket.removeEventListener("message", listener);

      console.log("Clearing ChannelMultiplexCollapser");
    }, { once: true });
  }

  public createSubflow(): SingleDestinationChannel {
    const channel = new SingleDestinationChannel(this);

    this.channels.push(channel);

    return channel;
  }

  [Symbol.dispose]() {
    this.channels.length = 0;

    console.log("ChannelMultiplexCollapser freed");
  }
}
