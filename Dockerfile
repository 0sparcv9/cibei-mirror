FROM denoland/deno:latest

WORKDIR /app

COPY deno.json deno.lock package.json* ./
RUN deno ci --prod --skip-types

COPY . .

CMD ["deno", "run", "--allow-net", "--allow-read", "bin/proxy.ts"]
