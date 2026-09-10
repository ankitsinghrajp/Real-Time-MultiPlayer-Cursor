import type {
  ClientMessage,
  ServerMessage,
} from "@shared/protocol";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  "ws://localhost:8080";

export class WebSocketConnection {
  private socket: WebSocket | null = null;

  private reconnectTimer: ReturnType<
    typeof setTimeout
  > | null = null;

  private reconnectAttempts = 0;

  private shouldReconnect = true;

  private onMessage:
    | ((message: ServerMessage) => void)
    | null = null;

  private onOpen:
    | (() => void)
    | null = null;

  private onClose:
    | (() => void)
    | null = null;

  private onError:
    | ((error: Event) => void)
    | null = null;

  connect(
    onMessage: (message: ServerMessage) => void,
    onOpen?: () => void,
    onClose?: () => void,
    onError?: (error: Event) => void,
  ) {
    this.onMessage = onMessage;
    this.onOpen = onOpen ?? null;
    this.onClose = onClose ?? null;
    this.onError = onError ?? null;

    this.shouldReconnect = true;

    this.createConnection();
  }

  private createConnection() {
    if (!this.shouldReconnect) {
      return;
    }

    if (
      this.socket &&
      (this.socket.readyState ===
        WebSocket.OPEN ||
        this.socket.readyState ===
          WebSocket.CONNECTING)
    ) {
      return;
    }

    console.log(
      "Connecting to WebSocket...",
    );

    const socket = new WebSocket(WS_URL);

    this.socket = socket;

    socket.onopen = () => {
      console.log(
        "WebSocket connected",
      );

      this.reconnectAttempts = 0;

      this.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        const message =
          JSON.parse(
            event.data,
          ) as ServerMessage;

        this.onMessage?.(message);
      } catch (error) {
        console.error(
          "Invalid server message:",
          error,
        );
      }
    };

    socket.onclose = () => {
      console.log(
        "WebSocket disconnected",
      );

      this.socket = null;

      this.onClose?.();

      this.scheduleReconnect();
    };

    socket.onerror = (error) => {
      console.error(
        "WebSocket error:",
        error,
      );

      this.onError?.(error);
    };
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      1000 *
        Math.pow(
          2,
          this.reconnectAttempts,
        ),
      10000,
    );

    this.reconnectAttempts++;

    console.log(
      `Reconnecting in ${delay}ms...`,
    );

    this.reconnectTimer =
      setTimeout(() => {
        this.reconnectTimer = null;

        this.createConnection();
      }, delay);
  }

  send(message: ClientMessage) {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(
      JSON.stringify(message),
    );
  }

  close() {
    this.shouldReconnect = false;

    if (this.reconnectTimer !== null) {
      clearTimeout(
        this.reconnectTimer,
      );

      this.reconnectTimer = null;
    }

    this.socket?.close();

    this.socket = null;
  }

  get connected() {
    return (
      this.socket?.readyState ===
      WebSocket.OPEN
    );
  }
}