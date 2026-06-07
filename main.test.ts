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

  socket.addEventListener("message", ({ data }: MessageEvent) => {
    console.log(new TextDecoder().decode(data));
  }, { passive: true });

  return socket;
};

const socket = await getTunnelSocket();

/**
 * Expose a transparent proxy
 */

async function tcp2ws(
  tcpConn: Deno.TcpConn,
  webSocket: WebSocket,
  signal: AbortSignal,
) {
  const abortController = new AbortController();

  const cleanup = () => {
    abortController.abort();
    try {
      tcpConn.close();
    } catch {
      0;
    }
  };

  signal.addEventListener("abort", cleanup);

  const tcpToWs = async () => {
    const reader = tcpConn.readable.getReader();

    try {
      while (true) {
        if (abortController.signal.aborted) break;

        const { value, done } = await reader.read();

        if (done) break;

        if (webSocket.readyState === WebSocket.OPEN) {
          try {
            webSocket.send(value);
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

      cleanup();
    }
  };

  const wsToTcp = async () => {
    const writer = tcpConn.writable.getWriter();

    const messageHandler = (event: MessageEvent) => {
      if (abortController.signal.aborted) return;

      try {
        if (event.data instanceof ArrayBuffer) {
          writer.write(new Uint8Array(event.data)).catch((error) => {
            if (
              !(error instanceof Deno.errors.BrokenPipe) &&
              !(error instanceof Deno.errors.ConnectionReset)
            ) {
              console.error(error);
            }

            cleanup();
          });
        } else if (typeof event.data === "string") {
          writer.write(new TextEncoder().encode(event.data)).catch((error) => {
            if (
              !(error instanceof Deno.errors.BrokenPipe) &&
              !(error instanceof Deno.errors.ConnectionReset)
            ) {
              console.error(error);
            }

            cleanup();
          });
        }
      } catch (error) {
        console.error(error);

        cleanup();
      }
    };

    webSocket.addEventListener("message", messageHandler);
    webSocket.addEventListener("close", cleanup);
    webSocket.addEventListener("error", cleanup);

    await new Promise((resolve) =>
      abortController.signal.addEventListener("abort", resolve)
    );

    webSocket.removeEventListener("message", messageHandler);

    await writer.close().catch(() => {});
  };

  await Promise.race([
    tcpToWs().catch((error) => {
      if (!(error instanceof Deno.errors.BadResource)) {
        console.error(error);
      }
    }),
    wsToTcp().catch((error) => {
      if (!(error instanceof Deno.errors.BadResource)) {
        console.error(error);
      }
    }),
  ]);
}

const listener = Deno.listen({ port: 1080, hostname: "0.0.0.0" });
const abortController = new AbortController();

socket.addEventListener("close", () => {
  console.log("WebSocket closed, aborting all connections");
  abortController.abort();
});

console.log("Listening at 0.0.0.0:1080");

for await (const clientConn of listener) {
  if (abortController.signal.aborted) {
    break;
  }

  const clientAbortController = new AbortController();

  abortController.signal.addEventListener("abort", () => {
    clientAbortController.abort();
  });

  tcp2ws(clientConn, socket, clientAbortController.signal).catch((error) => {
    if (
      error instanceof Deno.errors.BadResource ||
      error instanceof Deno.errors.BrokenPipe ||
      error instanceof Deno.errors.ConnectionReset
    ) {
      return;
    }

    console.error(error);
  });
}
