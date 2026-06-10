import config from "./lib/config_parser.ts";

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

async function tcp2ws(
  socketId: number,
  tcpConn: Deno.TcpConn,
  webSocket: WebSocket,
) {
  const reader = tcpConn.readable.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      if (webSocket.readyState === WebSocket.OPEN) {
        try {
          const packet = new Uint8Array([socketId, ...value]);

          console.log("Websocket send: ", packet);

          webSocket.send(packet);
        } catch (error) {
          console.error(error);

          break;
        }
      } else {
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.BadResource)) {
      console.error(error);
    }
  } finally {
    reader.releaseLock();
  }
}

socket.addEventListener("message", ({ data }) => {
  const [socketId, ...packetData] = new Uint8Array(data);

  const connection = clientConnections.get(socketId);

  if (connection) {
    connection.write(new Uint8Array(packetData));
  }
})

const listener = Deno.listen({ port: 1080, hostname: "0.0.0.0" });

console.log("Listening at 0.0.0.0:1080");

const clientConnections = new Map<number, Deno.TcpConn>();

for await (const clientConn of listener) {
  const socketId = clientConnections.size;

  clientConnections.set(socketId, clientConn);

  queueMicrotask(() => tcp2ws(socketId, clientConn, socket).catch((error) => {
    if (
      error instanceof Deno.errors.BadResource ||
      error instanceof Deno.errors.BrokenPipe ||
      error instanceof Deno.errors.ConnectionReset
    ) {
      return;
    }

    console.error(error);
  }));
}
