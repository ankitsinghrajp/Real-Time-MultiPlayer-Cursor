import type {
  ClientMessage,
  CursorMessage,
  JoinMessage,
  ReactionMessage,
  PingMessage,
} from "../../shared/protocol.js";

export function parseClientMessage(
  raw: string,
): ClientMessage | null {
  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObject(data)) {
    return null;
  }

  // JOIN
  if (data.type === "join") {
    if (
      typeof data.roomId !== "string" ||
      typeof data.clientId !== "string" ||
      data.roomId.length === 0 ||
      data.clientId.length === 0 ||
      data.roomId.length > 100 ||
      data.clientId.length > 100
    ) {
      return null;
    }

    const message: JoinMessage = {
      type: "join",
      roomId: data.roomId,
      clientId: data.clientId,
    };

    return message;
  }

  // CURSOR
  if (data.type === "cursor") {
    if (
      !isPositiveInteger(data.seq) ||
      !isValidCoordinate(data.x) ||
      !isValidCoordinate(data.y) ||
      !isPositiveNumber(data.timestamp)
    ) {
      return null;
    }

    const message: CursorMessage = {
      type: "cursor",
      seq: data.seq,
      x: data.x,
      y: data.y,
      timestamp: data.timestamp,
    };

    return message;
  }

  // REACTION
  if (data.type === "reaction") {
    if (
      !isPositiveInteger(data.seq) ||
      !isValidCoordinate(data.x) ||
      !isValidCoordinate(data.y) ||
      !isPositiveNumber(data.timestamp) ||
      data.reaction !== "❤️"
    ) {
      return null;
    }

    const message: ReactionMessage = {
      type: "reaction",
      seq: data.seq,
      reaction: data.reaction,
      x: data.x,
      y: data.y,
      timestamp: data.timestamp,
    };

    return message;
  }

  // LATENCY PING
  if (data.type === "ping") {
    if (!isPositiveNumber(data.timestamp)) {
      return null;
    }

    const message: PingMessage = {
      type: "ping",
      timestamp: data.timestamp,
    };

    return message;
  }

  return null;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isPositiveInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

function isPositiveNumber(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

function isValidCoordinate(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}