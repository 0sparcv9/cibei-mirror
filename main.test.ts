import config from "./lib/config_parser.ts";
import TCPSegmentEvent from "./lib/domain/streams/SegmentEvent.ts";
import Channel from "./lib/domain/ws/Channel.ts";
import { StatefulWebSocket } from "./lib/domain/ws/StatefulSocket.ts";
import { ControlMessage } from "./lib/domain/ws/ChannelMultiplexCollapser.ts";
import { Xor } from "./lib/domain/obfuscation/Xor.ts";

const { tunnelRegisterEndpoint, privateKey } = config.root.attributes;

/**
 * Register a designated TCP tunnel
 */

const req = await fetch(`http://127.0.0.1:8000${tunnelRegisterEndpoint}`);

const resp = await req.json();

const privKey = await crypto.subtle.importKey(
  "pkcs8",
  new Uint8Array(JSON.parse(privateKey)),
  "Ed25519",
  false,
  ["sign"],
);

const msg = Array.from(
  new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      privKey,
      new Uint8Array(resp.salt),
    ),
  ),
);

const getTunnelSocket = async () => {
  const tunnelUrl = `ws://127.0.0.1:8000${resp.url}`;

  console.log(`Connecting to ${tunnelUrl} with message`, msg);

  const socket = new WebSocket(tunnelUrl);

  socket.binaryType = "arraybuffer";

  await new Promise((e) => socket.addEventListener("open", e));

  socket.send(new Uint8Array(msg));

  return socket;
};

const socket = await getTunnelSocket();

const listener = Deno.listen({ port: 1080, hostname: "0.0.0.0" });

console.log("Listening at 0.0.0.0:1080");

const controlChannel = new Channel(socket as StatefulWebSocket);

controlChannel.setSocketId(0);

controlChannel.onPacket((packet) => {
  const [socketId, message] = packet;

  if (socketId > 0) {
    console.log("Received control message", message);

    switch (message) {
      case ControlMessage.Close: {
        dispatchEvent(
          new MessageEvent("Channel::close", {
            data: socketId,
          }),
        );

        break;
      }
    }
  }
});

for await (const clientConn of listener) {
  const channel = new Channel(socket as StatefulWebSocket);

  channel.addEventListener("close", () => {
    try {
      clientConn.close();
    } catch {
      0;
    }
  });

  console.log("Create new channel", channel);

  TCPSegmentEvent
    .attach(clientConn.readable)
    .addEventListener(
      "segment",
      (({ data }: TCPSegmentEvent) => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            console.log("Send ", data, "Socket ID " + channel.getSocketID());

            channel.sendPacket(data);
          } catch (error) {
            console.error(error);
          }
        }
      }) as EventListener,
    );

  channel.onPacket(async (packet) => {
    try {
      await clientConn.write(packet);
    } catch (e) {
      console.error(e);
    }
  });
}
