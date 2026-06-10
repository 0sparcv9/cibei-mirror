import config from "../lib/config_parser.ts";
import { StatefulWebSocket } from "./domain/ws/StatefulSocket.ts";
import TCPSegmentEvent from "./domain/streams/SegmentEvent.ts";
import Channel from "./domain/ws/Channel.ts";

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

const initTunnel = (socket: WebSocket, clientAuthMsg: Uint8Array) => {
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

    let serverConnection: Deno.TcpConn | undefined;

    const channel = new Channel(socket as StatefulWebSocket);

    channel.setAutodetectChannelID();

    channel.onPacket(async (packet) => {
      const socketId = channel.getSocketID();

      console.log("Socket id "  + socketId, "packet", packet);

      if (!serverConnection) {
        const serverConnectionDomain = exfiltrateTlsSni(new Uint8Array(packet));

        if (serverConnectionDomain) {
          serverConnection = await Deno.connect({
            hostname: serverConnectionDomain,
            port: 443
          });

          console.log("Connected to " + serverConnectionDomain);

          TCPSegmentEvent.attach(serverConnection.readable)
            .addEventListener("segment", (({ data }: TCPSegmentEvent) => {
              if (socket.readyState === WebSocket.OPEN) {
                console.log("TCP -> SOCKET");

                socket.send(new Uint8Array([socketId, ...data]));
              }
            }) as EventListener);
        }
      }

      const text = new TextDecoder().decode(new Uint8Array(packet));

      console.log(text);

      if (text.includes("CONNECT")) {
        const response = "HTTP/1.1 200 Connection Established\r\n\r\n";

        const encoded = new TextEncoder().encode(response);

        socket.send(new Uint8Array([socketId, ...encoded]));

        return;
      }

      await serverConnection!.write(new Uint8Array(packet));
    });
  }, { passive: true, once: true });
};

export default initTunnel;
