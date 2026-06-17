import config from "../lib/config_parser.ts";
import TCPSegmentEvent from "./domain/streams/SegmentEvent.ts";
import {
  ChannelMultiplexCollapser,
  ControlMessage,
} from "./domain/ws/ChannelMultiplexCollapser.ts";
import DisposableMap from "./domain/context/DisposableMap.ts";
import ClientHelloUtils from "./domain/tls/ClientHelloUtils.ts";
import { Xor } from "./domain/obfuscation/Xor.ts";
import "./Logger.ts";

const { publicKey } = config.root.attributes;

const pubKey = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(JSON.parse(publicKey)),
  "Ed25519",
  false,
  ["verify"],
);

const initTunnel = (
  collapser: ChannelMultiplexCollapser,
  socket: WebSocket,
  clientAuthMsg: Uint8Array,
) => {
  socket.addEventListener("message", async ({ data }) => {
    const bytesCopy =
      (data instanceof ArrayBuffer ? new Uint8Array(data) : data).slice();

    const signature = Xor.apply(bytesCopy);

    const result = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      Buffer.from(signature),
      Buffer.from(clientAuthMsg),
    );

    if (!result) {
      return socket.close();
    }

    using serverConnections = new DisposableMap<number, Deno.TcpConn>();

    const flow = collapser.createSubflow();

    flow.onPacket(async (socketId: number, packet: Uint8Array) => {
      console.log("Socket id " + socketId, "packet", packet);

      if (!serverConnections.has(socketId)) {
        const serverConnectionDomain = ClientHelloUtils.exfiltrateTlsSni(
          new Uint8Array(packet),
        );

        if (serverConnectionDomain) {
          const serverConnection = await Deno.connect({
            hostname: serverConnectionDomain,
            port: 443,
          });

          serverConnections.set(
            socketId,
            serverConnection,
          );

          const target = TCPSegmentEvent
            .attach(serverConnection.readable);

          console.log("Connected to " + serverConnectionDomain);

          target.addEventListener("close", () => {
            console.log("Server connection closed");

            serverConnections.delete(socketId);

            flow.sendControlMessage(socketId, ControlMessage.Close);
          }, { once: true });

          target.addEventListener(
            "segment",
            (({ data }: TCPSegmentEvent) => {
              console.log("TCP -> SOCKET");

              flow.sendPacket(socketId, data);
            }) as EventListener,
          );
        }
      }

      const serverConnection = serverConnections.get(
        socketId,
      );

      const text = new TextDecoder().decode(new Uint8Array(packet));

      if (text.includes("CONNECT")) {
        console.log("connect");
        const response = "HTTP/1.1 200 Connection Established\r\n\r\n";

        const encoded = new TextEncoder().encode(response);

        flow.sendPacket(socketId, encoded);

        return;
      }

      if (text.includes("GET")) {
        flow.sendControlMessage(socketId, ControlMessage.Close);

        return;
      }

      if (serverConnection) {
        return await serverConnection!.write(new Uint8Array(packet));
      }

      console.warn("Unrecognized proxy protocol!!!");
    });

    await new Promise((resolve) => socket.addEventListener("close", resolve));
  }, { passive: true, once: true });
};

export default initTunnel;
