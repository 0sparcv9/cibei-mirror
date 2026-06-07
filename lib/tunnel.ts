import config from "../lib/config_parser.ts";

const { publicKey } = config.root.attributes;

const pubKey = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(JSON.parse(publicKey)),
  "Ed25519",
  false,
  ["verify"],
);

const initTunnel = (socket: WebSocket, clientAuthMsg: Uint8Array) => {
  socket.addEventListener("message", async ({ data }) => {
    const signature = new Uint8Array(data);

    const result = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      signature,
      Buffer.from(clientAuthMsg),
    );

    if (result) {
      socket.send(new TextEncoder().encode("ok"));
    }
  }, { passive: true, once: true });
};

export default initTunnel;
