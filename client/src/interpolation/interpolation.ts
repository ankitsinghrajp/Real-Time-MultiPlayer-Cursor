import type { RemoteCursor } from "../sync/types";

type CursorSample = {
  x: number;
  y: number;
  timestamp: number;
};

export class InterpolationBuffer {
  private buffers = new Map<
    string,
    CursorSample[]
  >();

  private interpolationDelay = 80;

  addSample(cursor: RemoteCursor): void {
    let buffer = this.buffers.get(cursor.clientId);

    if (!buffer) {
      buffer = [];
      this.buffers.set(cursor.clientId, buffer);
    }

    // Ignore old/out-of-order samples
    const last = buffer[buffer.length - 1];

    if (last && cursor.timestamp <= last.timestamp) {
      return;
    }

    buffer.push({
      x: cursor.x,
      y: cursor.y,
      timestamp: cursor.timestamp,
    });

    // Keep only recent samples
    if (buffer.length > 20) {
      buffer.shift();
    }
  }

  removeCursor(clientId: string): void {
    this.buffers.delete(clientId);
  }

  getPosition(
    clientId: string,
    renderTime: number,
  ): { x: number; y: number } | null {
    const buffer = this.buffers.get(clientId);

    if (!buffer || buffer.length === 0) {
      return null;
    }

    const targetTime =
      renderTime - this.interpolationDelay;

    // Before first sample
    if (targetTime <= buffer[0].timestamp) {
      return {
        x: buffer[0].x,
        y: buffer[0].y,
      };
    }

    // Find two samples surrounding target time
    for (let i = 0; i < buffer.length - 1; i++) {
      const previous = buffer[i];
      const next = buffer[i + 1];

      if (
        targetTime >= previous.timestamp &&
        targetTime <= next.timestamp
      ) {
        const duration =
          next.timestamp - previous.timestamp;

        if (duration <= 0) {
          return {
            x: next.x,
            y: next.y,
          };
        }

        const progress =
          (targetTime - previous.timestamp) /
          duration;

        return {
          x:
            previous.x +
            (next.x - previous.x) * progress,

          y:
            previous.y +
            (next.y - previous.y) * progress,
        };
      }
    }

    // If we don't have a future sample yet,
    // hold the latest known position.
    const latest = buffer[buffer.length - 1];

    return {
      x: latest.x,
      y: latest.y,
    };
  }
}