import config from "../lib/config_parser.ts";

const { publicKey } = config.root.attributes;

const pubKey = await crypto.subtle.importKey(
  "raw",
  new Uint8Array(JSON.parse(publicKey)),
  "Ed25519",
  false,
  ["verify"],
);

const handleForward = ({ data }: MessageEvent) => {
  const packet = new Uint8Array(data);

  console.log(packet);
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

    socket.addEventListener("message", handleForward);
  }, { passive: true, once: true });
};

export default initTunnel;
