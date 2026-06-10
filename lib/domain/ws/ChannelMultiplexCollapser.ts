import { StatefulWebSocket } from "./StatefulSocket.ts";

export class SingleDestinationChannel {
  public onPacketCallback?: (socketId: number, packet: Uint8Array<ArrayBuffer>) => void = undefined;

  private controller: ChannelMultiplexCollapser;

  onPacket(callback: (socketId: number, packet: Uint8Array) => void) {
    this.onPacketCallback = callback;
  }

  public sendPacket(socketId: number, packet: Uint8Array) {
    this.controller.mainSocket.send(
      new Uint8Array([socketId, ...packet]),
    );
  }

  constructor(controller: ChannelMultiplexCollapser) {
    this.controller = controller;
  }
}

export class ChannelMultiplexCollapser extends EventTarget {
  public readonly mainSocket: StatefulWebSocket;
  private readonly channels: SingleDestinationChannel[] = [];

  constructor(socket: StatefulWebSocket) {
    super();

    this.mainSocket = socket;

    this.mainSocket.addEventListener("message", ({ data }: MessageEvent) => {
      const [socketId, ...packet] = new Uint8Array(data);

      this.channels.forEach(channel => {
        if (channel?.onPacketCallback)
          channel.onPacketCallback(socketId, new Uint8Array(packet));
      })
    })
  }

  public createSubflow(): SingleDestinationChannel {
    const channel = new SingleDestinationChannel(this);

    this.channels.push(channel);

    return channel;
  }
}
