import config from "../lib/config_parser.ts";
import TCPSegmentEvent from "./domain/streams/SegmentEvent.ts";
import {ChannelMultiplexCollapser} from "./domain/ws/ChannelMultiplexCollapser.ts";
import DisposableMap from "./domain/context/DisposableMap.ts";

const { publicKey } = config.root.attributes;

const pubKey = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(JSON.parse(publicKey)),
  "Ed25519",
  false,
  ["verify"],
);

const exfiltrateTlsSni = (
  packet: Uint8Array,
) => {
  if (
    packet.length === 0 ||
    packet[0] !== 0x16 ||
    packet.length < 48 ||
    packet.length <= 5 ||
    packet[5] !== 0x01
  ) {
    return null;
  }

  for (let i = 0; i <= packet.length - 9; i++) {
    if (packet[i] === 0xfe && packet[i + 1] === 0x0d) {
      console.log("Got CH with encrypted extensions");

      return "[ech]";
    }

    if (
      packet[i] === 0x00 &&
      packet[i + 1] === 0x00 &&
      packet[i + 6] === 0x00 &&
      (packet[i + 3] - packet[i + 5]) === 2
    ) {
      const len = packet[i + 8];

      const start = i + 9;

      const end = start + len;

      if (end <= packet.length && len > 0 && len < 256) {
        const decoder = new TextDecoder();

        return decoder.decode(packet.slice(start, end));
      }
    }
  }

  return null;
};

const initTunnel = async (
  collapser: ChannelMultiplexCollapser,
  socket: WebSocket,
  clientAuthMsg: Uint8Array
) => {
  socket.addEventListener("message", async ({ data }) => {
    const signature = new Uint8Array(data);

    const result = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      signature,
      Buffer.from(clientAuthMsg),
    );

    if (!result) {
      return socket.close();
    }

    using serverConnections = new DisposableMap<number, Deno.TcpConn>();

    const flow = collapser.createSubflow();

    flow.onPacket(async (socketId: number, packet: Uint8Array) => {
      console.log("Socket id "  + socketId, "packet", packet);

      if (!serverConnections.has(socketId)) {
        const serverConnectionDomain = exfiltrateTlsSni(new Uint8Array(packet));

        if (serverConnectionDomain) {
          const serverConnection = await Deno.connect({
            hostname: serverConnectionDomain,
            port: 443
          });

          serverConnections.set(
            socketId,
            serverConnection
          );

          const target = TCPSegmentEvent
            .attach(serverConnection.readable);

          console.log("Connected to " + serverConnectionDomain);

          target.addEventListener("close", () => {
            console.log("Server connection closed");

            serverConnections.delete(socketId);

            flow.sendPacket(socketId, new TextEncoder().encode("__close__"))
          }, { once: true });

          target.addEventListener("segment", (({ data }: TCPSegmentEvent) => {
              if (socket.readyState === WebSocket.OPEN) {
                console.log("TCP -> SOCKET");

                flow.sendPacket(socketId, data);
              }
            }) as EventListener);
        }
      }

      const serverConnection = serverConnections.get(
        socketId
      );

      const text = new TextDecoder().decode(new Uint8Array(packet));

      console.log(text);

      if (text.includes("CONNECT")) {
        const response = "HTTP/1.1 200 Connection Established\r\n\r\n";

        const encoded = new TextEncoder().encode(response);

        flow.sendPacket(socketId, encoded);

        return;
      }

      await serverConnection!.write(new Uint8Array(packet));
    });
  }, { passive: true, once: true });

  await new Promise(resolve => socket.addEventListener("close", resolve));
};

export default initTunnel;
