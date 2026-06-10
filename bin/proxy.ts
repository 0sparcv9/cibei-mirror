import config from "../lib/config_parser.ts";
import clients from "../lib/registration_manager.ts";
import initSocket from "../lib/tunnel.ts";
import {ChannelMultiplexCollapser} from "../lib/domain/ws/ChannelMultiplexCollapser.ts";
import {StatefulWebSocket} from "../lib/domain/ws/StatefulSocket.ts";

const { mimic, tunnelRegisterEndpoint, tunnelUrl } = config.root.attributes;

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === tunnelRegisterEndpoint) {
    const buf = new Uint8Array(12);

    crypto.getRandomValues(buf);

    return Response.json({
      "url": `${tunnelUrl}/${clients.register(buf)}`,
      "salt": Array.from(buf),
    });
  }

  const clientAuthMsg = clients.get(url.pathname.split(`${tunnelUrl}/`)[1]);

  if (clientAuthMsg) {
    const { socket, response } = Deno.upgradeWebSocket(req);

    queueMicrotask(() => {
      using collapser = new ChannelMultiplexCollapser(
        socket as StatefulWebSocket
      );

      initSocket(collapser, socket, clientAuthMsg)
        .then(_ => console.log("Socket complete"))
        .catch(e => console.error(e));
    });

    return response;
  }

  const { body } = await fetch(`${mimic}/${url.pathname}`);

  return new Response(body);
}

console.log(config);

Deno.serve(handler);
