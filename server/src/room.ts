import type { Duplex } from "node:stream";

export type ClientConnection = {
  clientId: string;
  socket: Duplex;
};

export type CursorState = {
  clientId: string;
  x: number;
  y: number;
  seq: number;
  timestamp: number;
};

export class Room {
  private clients = new Map<string, ClientConnection>();

  private cursors = new Map<string, CursorState>();

  addClient(client: ClientConnection): void {
    this.clients.set(client.clientId, client);

    if (!this.cursors.has(client.clientId)) {
      this.cursors.set(client.clientId, {
        clientId: client.clientId,
        x: 0.5,
        y: 0.5,
        seq: 0,
        timestamp: Date.now(),
      });
    }
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.cursors.delete(clientId);
  }

  getClient(
    clientId: string,
  ): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  getClients(): IterableIterator<ClientConnection> {
    return this.clients.values();
  }

  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getCursor(
    clientId: string,
  ): CursorState | undefined {
    return this.cursors.get(clientId);
  }

  updateCursor(cursor: CursorState): void {
    this.cursors.set(
      cursor.clientId,
      cursor,
    );
  }

  getSnapshot(): CursorState[] {
    return Array.from(
      this.cursors.values(),
    );
  }

  broadcast(
    message: string,
    excludeClientId?: string,
  ): void {
    for (const client of this.clients.values()) {
      if (
        client.clientId ===
        excludeClientId
      ) {
        continue;
      }

      if (client.socket.destroyed) {
        continue;
      }

      client.socket.write(
        this.createWebSocketFrame(message),
      );
    }
  }

  private createWebSocketFrame(
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
}