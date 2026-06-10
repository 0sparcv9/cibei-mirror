import config from "../lib/config_parser.ts";
import {SocketState, StatefulWebSocket} from "./domain/ws/StatefulSocket.ts";

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

const forwardTCPtoWebSocket = async (
  socketId: number,
  tcpConn: Deno.Conn,
  webSocket: WebSocket,
) => {
  try {
    const buffer = new Uint8Array(1024);

    while (true) {
      const bytesRead = await tcpConn.read(buffer);

      console.log("Read " + bytesRead + " bytes");

      if (bytesRead === null) {
        break;
      }

      const data = buffer.slice(0, bytesRead);

      if (webSocket.readyState === WebSocket.OPEN) {
        console.log("TCP -> SOCKET");

        webSocket.send(new Uint8Array([socketId, ...data]));
      } else {
        break;
      }
    }
  } catch {
    0;
  } finally {
    try {
      tcpConn.close();
    } catch {
      0;
    }
  }
};

const sockets = new Map<number, Deno.TcpConn>();

const handleForward = async (
  socket: StatefulWebSocket,
  { data }: MessageEvent,
) => {
  const [socketId, ...packet] = new Uint8Array(data);

  console.log("Socket id " + socketId + " message ", packet);

  if (!sockets.has(socketId)) {
    const serverConnectionDomain = exfiltrateTlsSni(new Uint8Array(packet));

    if (serverConnectionDomain) {
      const serverConnection = await Deno.connect({
        hostname: serverConnectionDomain,
        port: 443,
      });

      sockets.set(
          socketId,
          serverConnection
      );

      queueMicrotask(() =>
          forwardTCPtoWebSocket(socketId, serverConnection, socket)
      );

      socket.state = SocketState.Forward;
    }
  }

  const text = new TextDecoder().decode(new Uint8Array(packet));

  console.log("Socket id: " + socketId, text)

  if (text.includes("CONNECT")) {
    const response = "HTTP/1.1 200 Connection Established\r\n\r\n";

    const encoded = new TextEncoder().encode(response);

    socket.send(new Uint8Array([socketId, ...encoded]));

    socket.state = SocketState.ExpectForwardData;

    return
  }

  const serverConnection = sockets.get(socketId);

  if (!serverConnection) throw new Error("Broken socket state");

  await serverConnection.write(new Uint8Array(packet));
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

    socket.addEventListener(
      "message",
      (event) =>
        handleForward(
          socket as StatefulWebSocket,
          event,
        ),
    );
  }, { passive: true, once: true });
};

export default initTunnel;
