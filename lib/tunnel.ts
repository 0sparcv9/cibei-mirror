import config from "../lib/config_parser.ts";

const { publicKey } = config.root.attributes;

const pubKey = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(JSON.parse(publicKey)),
  "Ed25519",
  false,
  ["verify"],
);

type StatefulWebSocket = WebSocket & {
  state: SocketState;
  serverConnection: Deno.TcpConn;
};

enum SocketState {
  HttpConnect,
  ExpectForwardData,
  ExfiltrateTLSSni,
  Forward,
}

/*
 * Stole this code from myself
 * https://codeberg.org/verybinary/waterfall/src/branch/main/src/wfconfig/protocol.rs#L101
 */

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

        const sni = decoder.decode(packet.slice(start, end));

        return sni;
      }
    }
  }

  return null;
};

const forwardTransparent = async (
  socket: StatefulWebSocket,
  packet: ArrayBuffer | Uint8Array,
) => {
  const data = packet instanceof Uint8Array ? packet : new Uint8Array(packet);

  await socket.serverConnection.write(data);
};

const forwardTCPtoWebSocket = async (
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

        webSocket.send(data);
      } else {
        break;
      }
    }
  } catch {
    0;
  } finally {
    try {
      tcpConn.close();

      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.close();
      }
    } catch {
      0;
    }
  }
};

const handleForward = async (
  socket: StatefulWebSocket,
  { data }: MessageEvent,
) => {
  const packet = new Uint8Array(data);

  if (socket.state === SocketState.ExpectForwardData) {
    socket.state = SocketState.ExfiltrateTLSSni;

    const serverConnectionDomain = exfiltrateTlsSni(packet);

    if (serverConnectionDomain) {
      socket.serverConnection = await Deno.connect({
        hostname: serverConnectionDomain,
        port: 443,
      });

      console.log("Connected to " + serverConnectionDomain);

      await forwardTransparent(socket, packet);

      queueMicrotask(() =>
        forwardTCPtoWebSocket(socket.serverConnection, socket)
      );

      console.log("Working");

      socket.addEventListener("message", async ({ data }) => {
        await forwardTransparent(socket, data);
      });
    }
  }

  const text = new TextDecoder().decode(packet);

  /*
   * HTTP Connect
   */

  if (text.includes("CONNECT")) {
    const response = "HTTP/1.1 200 Connection Established\r\n\r\n";

    socket.send(new TextEncoder().encode(response));

    socket.state = SocketState.ExpectForwardData;
  }
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
