export enum SocketState {
  HttpConnect,
  ExpectForwardData,
  ExfiltrateTLSSni,
  Forward,
}

export type StatefulWebSocket = WebSocket & {
  state: SocketState;
  serverConnection: Deno.TcpConn;
};
