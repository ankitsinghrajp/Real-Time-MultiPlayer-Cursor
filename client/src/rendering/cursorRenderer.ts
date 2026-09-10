import type { RemoteCursor } from "../sync/types";

export class CursorRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.ctx = ctx;
  }

  render(
    localPosition: { x: number; y: number },
    remoteCursors: RemoteCursor[],
  ) {
    const { width, height } = this.canvas;

    this.ctx.clearRect(0, 0, width, height);

    // Draw local cursor
    this.drawCursor(
      localPosition.x * width,
      localPosition.y * height,
      "YOU",
      false,
    );

    // Draw remote cursors
    for (const cursor of remoteCursors) {
      this.drawCursor(
        cursor.x * width,
        cursor.y * height,
        cursor.clientId.slice(0, 6),
        true,
      );
    }
  }

  private drawCursor(
    x: number,
    y: number,
    label: string,
    remote: boolean,
  ) {
    const ctx = this.ctx;

    // Cursor arrow
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 20);
    ctx.lineTo(x + 6, y + 15);
    ctx.lineTo(x + 14, y + 24);
    ctx.lineTo(x + 18, y + 20);
    ctx.lineTo(x + 10, y + 11);
    ctx.lineTo(x + 18, y + 8);
    ctx.closePath();

    ctx.fillStyle = remote ? "#ef4444" : "#2563eb";
    ctx.fill();

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.font = "bold 13px Arial";

    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = remote
      ? "rgba(239, 68, 68, 0.9)"
      : "rgba(37, 99, 235, 0.9)";

    ctx.fillRect(
      x + 20,
      y - 8,
      textWidth + 12,
      22,
    );

    ctx.fillStyle = "#ffffff";

    ctx.fillText(
      label,
      x + 26,
      y + 8,
    );
  }
}