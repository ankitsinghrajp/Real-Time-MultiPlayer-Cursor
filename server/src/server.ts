import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";

import { RoomManager } from "./roomManager.js";
import type { Room } from "./room.js";
import { parseClientMessage } from "./protocol.js";

const PORT = 8080;

const HEARTBEAT_INTERVAL = 30_000;

const MAX_MESSAGE_SIZE = 64 * 1024;

const WEBSOCKET_MAGIC_KEY =
  "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const roomManager = new RoomManager();

type ConnectedClient = {
  socket: Duplex;
  roomId: string | null;
  clientId: string | null;
  isAlive: boolean;
};

const clients = new Set<ConnectedClient>();

function createAcceptKey(key: string): string {
  return createHash("sha1")
    .update(
      key + WEBSOCKET_MAGIC_KEY,
      "binary",
    )
    .digest("base64");
}

function createWebSocketFrame(
  message: string,
): Buffer {
  const payload = Buffer.from(message);
  const length = payload.length;

  if (length < 126) {
    const frame = Buffer.alloc(
      2 + length,
    );

    frame[0] = 0x81;
    frame[1] = length;

    payload.copy(frame, 2);

    return frame;
  }

  if (length < 65536) {
    const frame = Buffer.alloc(
      4 + length,
    );

    frame[0] = 0x81;
    frame[1] = 126;

    frame.writeUInt16BE(
      length,
      2,
    );

    payload.copy(frame, 4);

    return frame;
  }

  const frame = Buffer.alloc(
    10 + length,
  );

  frame[0] = 0x81;
  frame[1] = 127;

  frame.writeBigUInt64BE(
    BigInt(length),
    2,
  );

  payload.copy(frame, 10);

  return frame;
}

function sendMessage(
  socket: Duplex,
  message: unknown,
): void {
  if (socket.destroyed) {
    return;
  }

  const json = JSON.stringify(message);

  socket.write(
    createWebSocketFrame(json),
  );
}

function sendError(
  socket: Duplex,
  code: string,
  message: string,
): void {
  sendMessage(socket, {
    type: "error",
    code,
    message,
  });
}

function sendSnapshot(
  socket: Duplex,
  room: Room,
): void {
  const participants =
    room.getSnapshot().map(
      (cursor) => ({
        clientId: cursor.clientId,
        x: cursor.x,
        y: cursor.y,
      }),
    );

  sendMessage(socket, {
    type: "snapshot",
    participants,
  });
}

function sendPing(
  socket: Duplex,
): void {
  if (socket.destroyed) {
    return;
  }

  const frame = Buffer.from([
    0x89,
    0x00,
  ]);

  socket.write(frame);
}

function sendPong(
  socket: Duplex,
  payload: Buffer,
): void {
  if (payload.length > 125) {
    return;
  }

  const frame = Buffer.alloc(
    2 + payload.length,
  );

  frame[0] = 0x8a;
  frame[1] = payload.length;

  payload.copy(frame, 2);

  socket.write(frame);
}

function parseWebSocketFrame(
  buffer: Buffer,
) {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const opcode = firstByte & 0x0f;

  const masked =
    (secondByte & 0x80) !== 0;

  let payloadLength =
    secondByte & 0x7f;

  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }

    payloadLength =
      buffer.readUInt16BE(2);

    offset = 4;
  }

  if (payloadLength === 127) {
    if (buffer.length < 10) {
      return null;
    }

    const length =
      buffer.readBigUInt64BE(2);

    if (
      length >
      BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(
        "Frame too large",
      );
    }

    payloadLength =
      Number(length);

    offset = 10;
  }

  let mask: Buffer | null = null;

  if (masked) {
    if (
      buffer.length <
      offset + 4
    ) {
      return null;
    }

    mask = buffer.subarray(
      offset,
      offset + 4,
    );

    offset += 4;
  }

  const frameEnd =
    offset + payloadLength;

  if (
    buffer.length < frameEnd
  ) {
    return null;
  }

  const payload = Buffer.from(
    buffer.subarray(
      offset,
      frameEnd,
    ),
  );

  if (mask) {
    for (
      let i = 0;
      i < payload.length;
      i++
    ) {
      payload[i] ^=
        mask[i % 4];
    }
  }

  return {
    opcode,
    payload,
    consumed: frameEnd,
  };
}

function cleanupClient(
  client: ConnectedClient,
): void {
  const roomId =
    client.roomId;

  const clientId =
    client.clientId;

  if (!roomId || !clientId) {
    return;
  }

  const room =
    roomManager.getRoom(roomId);

  if (room) {
    room.removeClient(
      clientId,
    );

    room.broadcast(
      JSON.stringify({
        type:
          "participant_left",
        clientId,
      }),
    );
  }

  roomManager.removeClientFromRoom(
    roomId,
    clientId,
  );

  console.log(
    `${clientId} left ${roomId}`,
  );

  client.roomId = null;
  client.clientId = null;
}

const server = createServer(
  (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, {
        "Content-Type":
          "application/json",
      });

      res.end(
        JSON.stringify({
          status: "ok",
          service:
            "multiplayer-sync-server",
        }),
      );

      return;
    }

    res.writeHead(404);

    res.end("Not Found");
  },
);

server.on(
  "upgrade",
  (req, socket) => {
    const key =
      req.headers[
        "sec-websocket-key"
      ];

    if (
      !key ||
      Array.isArray(key)
    ) {
      socket.destroy();
      return;
    }

    const acceptKey =
      createAcceptKey(key);

    const response = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    socket.write(response);

    console.log(
      "WebSocket connected",
    );

    const client: ConnectedClient = {
      socket,
      roomId: null,
      clientId: null,
      isAlive: true,
    };

    clients.add(client);

    let buffer = Buffer.alloc(0);

    socket.on(
      "data",
      (data: Buffer) => {
        client.isAlive = true;

        buffer = Buffer.concat([
          buffer,
          data,
        ]);

        if (
          buffer.length >
          MAX_MESSAGE_SIZE
        ) {
          sendError(
            socket,
            "MESSAGE_TOO_LARGE",
            "WebSocket message is too large",
          );

          socket.destroy();

          return;
        }

        while (true) {
          let frame;

          try {
            frame =
              parseWebSocketFrame(
                buffer,
              );
          } catch {
            sendError(
              socket,
              "INVALID_FRAME",
              "Invalid WebSocket frame",
            );

            socket.destroy();

            return;
          }

          if (!frame) {
            break;
          }

          buffer =
            buffer.subarray(
              frame.consumed,
            );

          // Close frame
          if (
            frame.opcode === 0x8
          ) {
            socket.end();

            return;
          }

          // Ping frame
          if (
            frame.opcode === 0x9
          ) {
            sendPong(
              socket,
              frame.payload,
            );

            continue;
          }

          // Pong frame
          if (
            frame.opcode === 0xa
          ) {
            client.isAlive = true;

            continue;
          }

          // Only process text frames
          if (
            frame.opcode !== 0x1
          ) {
            continue;
          }

          const raw =
            frame.payload.toString(
              "utf8",
            );

          const message =
            parseClientMessage(
              raw,
            );

          if (!message) {
            sendError(
              socket,
              "INVALID_MESSAGE",
              "Invalid message",
            );

            continue;
          }

          // JOIN
          if (
            message.type === "join"
          ) {
            if (
              client.roomId
            ) {
              sendError(
                socket,
                "ALREADY_JOINED",
                "Client already joined a room",
              );

              continue;
            }

            client.clientId =
              message.clientId;

            client.roomId =
              message.roomId;

            const room =
              roomManager.getOrCreateRoom(
                message.roomId,
              );

            sendMessage(
              socket,
              {
                type: "welcome",
                clientId:
                  message.clientId,
              },
            );

            sendSnapshot(
              socket,
              room,
            );

            room.addClient({
              clientId:
                message.clientId,
              socket,
            });

            room.broadcast(
              JSON.stringify({
                type:
                  "participant_joined",
                clientId:
                  message.clientId,
              }),
              message.clientId,
            );

            console.log(
              `${message.clientId} joined ${message.roomId}`,
            );

            continue;
          }

          // Must join before other messages
          if (
            !client.roomId ||
            !client.clientId
          ) {
            sendError(
              socket,
              "NOT_JOINED",
              "Join a room first",
            );

            continue;
          }

          const room =
            roomManager.getRoom(
              client.roomId,
            );

          if (!room) {
            sendError(
              socket,
              "ROOM_NOT_FOUND",
              "Room no longer exists",
            );

            continue;
          }

          // CURSOR
          if (
            message.type ===
            "cursor"
          ) {
            const previous =
              room.getCursor(
                client.clientId,
              );

            if (
              previous &&
              message.seq <=
                previous.seq
            ) {
              continue;
            }

            room.updateCursor({
              clientId:
                client.clientId,
              x: message.x,
              y: message.y,
              seq: message.seq,
              timestamp:
                message.timestamp,
            });

            room.broadcast(
              JSON.stringify({
                type: "cursor",
                clientId:
                  client.clientId,
                seq:
                  message.seq,
                x: message.x,
                y: message.y,
                timestamp:
                  message.timestamp,
              }),
              client.clientId,
            );

            continue;
          }

          // REACTION
          if (
            message.type ===
            "reaction"
          ) {
            room.broadcast(
              JSON.stringify({
                type: "reaction",
                clientId:
                  client.clientId,
                seq:
                  message.seq,
                reaction:
                  message.reaction,
                x: message.x,
                y: message.y,
                timestamp:
                  message.timestamp,
              }),
              client.clientId,
            );

            continue;
          }

          // LATENCY PING
          if (
            message.type ===
            "ping"
          ) {
            sendMessage(
              socket,
              {
                type: "pong",
                timestamp:
                  message.timestamp,
              },
            );

            continue;
          }
        }
      },
    );

    socket.on(
      "close",
      () => {
        clients.delete(client);

        cleanupClient(
          client,
        );
      },
    );

    socket.on(
      "error",
      (error) => {
        console.error(
          "WebSocket error:",
          error.message,
        );
      },
    );
  },
);

// Server heartbeat
const heartbeatTimer =
  setInterval(() => {
    for (const client of clients) {
      if (
        client.socket.destroyed
      ) {
        clients.delete(client);

        cleanupClient(client);

        continue;
      }

      if (!client.isAlive) {
        console.log(
          "Terminating inactive WebSocket connection",
        );

        clients.delete(client);

        client.socket.destroy();

        cleanupClient(client);

        continue;
      }

      client.isAlive = false;

      sendPing(
        client.socket,
      );
    }
  }, HEARTBEAT_INTERVAL);

server.listen(
  PORT,
  () => {
    console.log(
      `HTTP server running on http://localhost:${PORT}`,
    );

    console.log(
      `WebSocket server running on ws://localhost:${PORT}`,
    );

    console.log(
      "WebSocket heartbeat enabled",
    );
  },
);

process.on(
  "SIGINT",
  () => {
    clearInterval(
      heartbeatTimer,
    );

    for (
      const client of clients
    ) {
      client.socket.destroy();
    }

    clients.clear();

    server.close(() => {
      process.exit(0);
    });
  },
);