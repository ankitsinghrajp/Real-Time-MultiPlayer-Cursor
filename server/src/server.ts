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
        clientId:
          cursor.clientId,
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

  socket.write(
    Buffer.from([
      0x89,
      0x00,
    ]),
  );
}

function sendPong(
  socket: Duplex,
  payload: Buffer,
): void {
  if (
    socket.destroyed ||
    payload.length > 125
  ) {
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

type ParsedFrame = {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  consumed: number;
};

function parseWebSocketFrame(
  buffer: Buffer,
): ParsedFrame | null {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin =
    (firstByte & 0x80) !== 0;

  const rsv1 =
    (firstByte & 0x40) !== 0;

  const rsv2 =
    (firstByte & 0x20) !== 0;

  const rsv3 =
    (firstByte & 0x10) !== 0;

  const opcode =
    firstByte & 0x0f;

  const masked =
    (secondByte & 0x80) !== 0;

  let payloadLength =
    secondByte & 0x7f;

  let offset = 2;

  if (
    rsv1 ||
    rsv2 ||
    rsv3
  ) {
    throw new Error(
      "Reserved WebSocket bits are not supported",
    );
  }

  if (
    opcode >= 0x8
  ) {
    if (!fin) {
      throw new Error(
        "Control frames cannot be fragmented",
      );
    }

    if (
      payloadLength > 125
    ) {
      throw new Error(
        "Control frame payload too large",
      );
    }
  }

  if (
    payloadLength === 126
  ) {
    if (
      buffer.length < 4
    ) {
      return null;
    }

    payloadLength =
      buffer.readUInt16BE(2);

    offset = 4;
  }

  if (
    payloadLength === 127
  ) {
    if (
      buffer.length < 10
    ) {
      return null;
    }

    const length =
      buffer.readBigUInt64BE(2);

    if (
      length >
      BigInt(
        MAX_MESSAGE_SIZE,
      )
    ) {
      throw new Error(
        "Frame payload too large",
      );
    }

    payloadLength =
      Number(length);

    offset = 10;
  }

  if (!masked) {
    throw new Error(
      "Client WebSocket frames must be masked",
    );
  }

  if (
    buffer.length <
    offset + 4
  ) {
    return null;
  }

  const mask =
    buffer.subarray(
      offset,
      offset + 4,
    );

  offset += 4;

  const frameEnd =
    offset + payloadLength;

  if (
    frameEnd >
    buffer.length
  ) {
    return null;
  }

  const payload =
    Buffer.from(
      buffer.subarray(
        offset,
        frameEnd,
      ),
    );

  for (
    let i = 0;
    i < payload.length;
    i++
  ) {
    payload[i] ^=
      mask[i % 4];
  }

  return {
    fin,
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

  if (
    !roomId ||
    !clientId
  ) {
    return;
  }

  const room =
    roomManager.getRoom(
      roomId,
    );

  if (!room) {
    client.roomId = null;
    client.clientId = null;
    return;
  }

  room.removeClient(
    clientId,
  );

  room.broadcast(
    JSON.stringify({
      type: "participant_left",
      clientId,
    }),
  );

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
    if (
      req.url ===
      "/health"
    ) {
      res.writeHead(
        200,
        {
          "Content-Type":
            "application/json",
        },
      );

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

    res.end(
      "Not Found",
    );
  },
);

server.on(
  "upgrade",
  (req, socket) => {
    const key =
      req.headers[
        "sec-websocket-key"
      ];

    const version =
      req.headers[
        "sec-websocket-version"
      ];

    if (
      !key ||
      Array.isArray(key) ||
      version !== "13"
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

    socket.write(
      response,
    );

    console.log(
      "WebSocket connected",
    );

    const client:
      ConnectedClient = {
      socket,
      roomId: null,
      clientId: null,
      isAlive: true,
    };

    clients.add(
      client,
    );

    let buffer =
      Buffer.alloc(0);

    let fragmentedMessage:
      Buffer[] | null = null;

    let fragmentedOpcode:
      number | null = null;

    let fragmentedSize = 0;

    const resetFragmentation =
      () => {
        fragmentedMessage =
          null;

        fragmentedOpcode =
          null;

        fragmentedSize = 0;
      };

    const processTextMessage =
      (payload: Buffer) => {
        const raw =
          payload.toString(
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

          return;
        }

        if (
          message.type ===
          "join"
        ) {
          if (
            client.roomId
          ) {
            sendError(
              socket,
              "ALREADY_JOINED",
              "Client already joined a room",
            );

            return;
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

          return;
        }

        if (
          !client.roomId ||
          !client.clientId
        ) {
          sendError(
            socket,
            "NOT_JOINED",
            "Join a room first",
          );

          return;
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

          return;
        }

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
            return;
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

          return;
        }

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

          return;
        }

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
        }
      };

    socket.on(
      "data",
      (data: Buffer) => {
        client.isAlive =
          true;

        buffer =
          Buffer.concat([
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

        while (
          buffer.length > 0
        ) {
          let frame:
            | ParsedFrame
            | null;

          try {
            frame =
              parseWebSocketFrame(
                buffer,
              );
          } catch (
            error
          ) {
            sendError(
              socket,
              "INVALID_FRAME",
              error instanceof Error
                ? error.message
                : "Invalid WebSocket frame",
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

          if (
            frame.opcode ===
            0x8
          ) {
            socket.end();
            return;
          }

          if (
            frame.opcode ===
            0x9
          ) {
            sendPong(
              socket,
              frame.payload,
            );

            continue;
          }

          if (
            frame.opcode ===
            0xa
          ) {
            client.isAlive =
              true;

            continue;
          }

          if (
            frame.opcode ===
            0x0
          ) {
            if (
              fragmentedMessage ===
                null ||
              fragmentedOpcode ===
                null
            ) {
              sendError(
                socket,
                "INVALID_FRAME",
                "Unexpected continuation frame",
              );

              socket.destroy();
              return;
            }

            fragmentedMessage.push(
              frame.payload,
            );

            fragmentedSize +=
              frame.payload.length;

            if (
              fragmentedSize >
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

            if (
              frame.fin
            ) {
              const completePayload =
                Buffer.concat(
                  fragmentedMessage,
                );

              if (
                fragmentedOpcode ===
                0x1
              ) {
                processTextMessage(
                  completePayload,
                );
              }

              resetFragmentation();
            }

            continue;
          }

          if (
            frame.opcode !==
              0x1 &&
            frame.opcode !==
              0x2
          ) {
            sendError(
              socket,
              "INVALID_FRAME",
              "Unsupported WebSocket opcode",
            );

            socket.destroy();
            return;
          }

          if (
            fragmentedMessage !==
            null
          ) {
            sendError(
              socket,
              "INVALID_FRAME",
              "New data frame before previous message completed",
            );

            socket.destroy();
            return;
          }

          if (
            frame.fin
          ) {
            if (
              frame.opcode ===
              0x1
            ) {
              processTextMessage(
                frame.payload,
              );
            }

            continue;
          }

          fragmentedMessage =
            [
              frame.payload,
            ];

          fragmentedOpcode =
            frame.opcode;

          fragmentedSize =
            frame.payload.length;

          if (
            fragmentedSize >
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
        }
      },
    );

    socket.on(
      "close",
      () => {
        clients.delete(
          client,
        );

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

const heartbeatTimer =
  setInterval(() => {
    for (
      const client of clients
    ) {
      if (
        client.socket.destroyed
      ) {
        clients.delete(
          client,
        );

        cleanupClient(
          client,
        );

        continue;
      }

      if (
        !client.isAlive
      ) {
        console.log(
          "Terminating inactive WebSocket connection",
        );

        clients.delete(
          client,
        );

        client.socket.destroy();

        cleanupClient(
          client,
        );

        continue;
      }

      client.isAlive =
        false;

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

    server.close(
      () => {
        process.exit(0);
      },
    );
  },
);