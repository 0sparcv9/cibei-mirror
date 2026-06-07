import config from "../lib/config_parser.ts";
import clients from "../lib/registration_manager.ts";
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

  const { body } = await fetch(`${mimic}/${url.pathname}`);

  return new Response(body);
}

console.log(config);

Deno.serve(handler);
