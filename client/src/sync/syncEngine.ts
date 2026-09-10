import { WebSocketConnection } from "./connection";

import type {
  RemoteCursor,
  Participant,
} from "./types";

import type {
  ServerMessage,
  ClientMessage,
} from "@shared/protocol";

type SyncEngineOptions = {
  roomId: string;
  clientId: string;

  onSnapshot?: (
    participants: Participant[],
  ) => void;

  onCursor?: (
    cursor: RemoteCursor,
  ) => void;

  onParticipantJoined?: (
    clientId: string,
  ) => void;

  onParticipantLeft?: (
    clientId: string,
  ) => void;

  onReaction?: (
    clientId: string,
    x: number,
    y: number,
  ) => void;

  onLatency?: (
    latency: number,
  ) => void;

  onConnected?: () => void;

  onDisconnected?: () => void;
};

export class SyncEngine {
  private connection =
    new WebSocketConnection();

  private roomId: string;
  private clientId: string;

  private sequence = 0;

  private options: SyncEngineOptions;

  private readonly cursorInterval = 33;

  private pendingCursor: {
    x: number;
    y: number;
  } | null = null;

  private cursorTimer: ReturnType<
    typeof setTimeout
  > | null = null;

  private latencyTimer: ReturnType<
    typeof setInterval
  > | null = null;

  constructor(
    options: SyncEngineOptions,
  ) {
    this.roomId = options.roomId;
    this.clientId = options.clientId;
    this.options = options;
  }

  connect() {
    this.connection.connect(
      (message) => {
        this.handleServerMessage(message);
      },

      () => {
        this.joinRoom();

        this.startLatencyCheck();

        this.options.onConnected?.();
      },

      () => {
        this.stopLatencyCheck();

        this.options.onDisconnected?.();
      },
    );
  }

  private joinRoom() {
    const message: ClientMessage = {
      type: "join",
      roomId: this.roomId,
      clientId: this.clientId,
    };

    this.connection.send(message);
  }

  sendCursor(
    x: number,
    y: number,
  ) {
    this.pendingCursor = {
      x,
      y,
    };

    if (this.cursorTimer !== null) {
      return;
    }

    this.sendPendingCursor();
  }

  private sendPendingCursor() {
    if (!this.pendingCursor) {
      this.cursorTimer = null;
      return;
    }

    const { x, y } = this.pendingCursor;

    this.pendingCursor = null;

    this.sequence++;

    const message: ClientMessage = {
      type: "cursor",
      seq: this.sequence,
      x,
      y,
      timestamp: Date.now(),
    };

    this.connection.send(message);

    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;

      if (this.pendingCursor) {
        this.sendPendingCursor();
      }
    }, this.cursorInterval);
  }

  sendReaction(
    x: number,
    y: number,
  ) {
    this.sequence++;

    const message: ClientMessage = {
      type: "reaction",
      seq: this.sequence,
      reaction: "❤️",
      x,
      y,
      timestamp: Date.now(),
    };

    this.connection.send(message);
  }

  private startLatencyCheck() {
    this.stopLatencyCheck();

    this.sendPing();

    this.latencyTimer = setInterval(() => {
      this.sendPing();
    }, 3000);
  }

  private stopLatencyCheck() {
    if (this.latencyTimer !== null) {
      clearInterval(this.latencyTimer);
      this.latencyTimer = null;
    }
  }

  private sendPing() {
    const message: ClientMessage = {
      type: "ping",
      timestamp: Date.now(),
    };

    this.connection.send(message);
  }

  private handleServerMessage(
    message: ServerMessage,
  ) {
    switch (message.type) {
      case "welcome":
        console.log(
          "Welcome:",
          message.clientId,
        );
        break;

      case "snapshot":
        this.options.onSnapshot?.(
          message.participants,
        );
        break;

      case "participant_joined":
        this.options.onParticipantJoined?.(
          message.clientId,
        );
        break;

      case "participant_left":
        this.options.onParticipantLeft?.(
          message.clientId,
        );
        break;

      case "cursor":
        if (
          message.clientId ===
          this.clientId
        ) {
          return;
        }

        this.options.onCursor?.({
          clientId: message.clientId,
          x: message.x,
          y: message.y,
          seq: message.seq,
          timestamp: message.timestamp,
        });

        break;

      case "reaction":
        this.options.onReaction?.(
          message.clientId,
          message.x,
          message.y,
        );

        break;

      case "pong": {
        const latency =
          Date.now() -
          message.timestamp;

        this.options.onLatency?.(
          latency,
        );

        break;
      }

      case "error":
        console.error(
          `[${message.code}] ${message.message}`,
        );
        break;
    }
  }

  disconnect() {
    if (this.cursorTimer !== null) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }

    this.stopLatencyCheck();

    this.pendingCursor = null;

    this.connection.close();
  }
}