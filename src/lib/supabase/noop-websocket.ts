class NoopWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  CONNECTING = NoopWebSocket.CONNECTING;
  OPEN = NoopWebSocket.OPEN;
  CLOSING = NoopWebSocket.CLOSING;
  CLOSED = NoopWebSocket.CLOSED;
  readyState = NoopWebSocket.CLOSED;
  protocol = "";
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;

  constructor(public url: string) {}

  close() {}

  send() {
    throw new Error("Realtime WebSocket transport is not available on this server client.");
  }

  addEventListener() {}

  removeEventListener() {}
}

export const noRealtimeOptions = {
  realtime: {
    transport: NoopWebSocket as unknown as typeof WebSocket,
  },
};
