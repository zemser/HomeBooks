export class NoopWebSocket {
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
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;

  constructor(url) {
    this.url = url;
  }

  close() {}

  send() {
    throw new Error("Realtime WebSocket transport is not available in this script.");
  }

  addEventListener() {}

  removeEventListener() {}
}

export const noRealtimeOptions = {
  realtime: {
    transport: NoopWebSocket,
  },
};
