import config from "./lib/config_parser.ts";

const { tunnelRegisterEndpoint, privateKey } = config.root.attributes;

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

const tunnelUrl = `ws://127.0.0.1:8000${resp.url}`;

console.log(`Connecting to ${tunnelUrl} with message`, msg);

const socket = new WebSocket(tunnelUrl);

socket.binaryType = "arraybuffer";

await new Promise((e) => socket.addEventListener("open", e));

socket.send(new Uint8Array(msg));

socket.addEventListener("message", ({ data }: MessageEvent) => {
  console.log(new TextDecoder().decode(data));
}, { passive: true });

await new Promise((e) => socket.addEventListener("close", e));
