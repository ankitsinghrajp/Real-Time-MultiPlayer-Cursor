import type { RemoteCursor } from "../sync/types";

export class CursorRenderer {
  private canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error(
        "Canvas 2D context is not available",
      );
    }

    this.ctx = ctx;
  }

  render(
    localPosition: {
      x: number;
      y: number;
    },
    remoteCursors: RemoteCursor[],
  ) {
    const {
      width,
      height,
    } = this.canvas;

    this.ctx.clearRect(
      0,
      0,
      width,
      height,
    );

    this.drawCursor(
      localPosition.x * width,
      localPosition.y * height,
      "YOU",
      true,
    );

    for (const cursor of remoteCursors) {
      this.drawCursor(
        cursor.x * width,
        cursor.y * height,
        `User ${cursor.clientId.slice(0, 6)}`,
        false,
      );
    }
  }

  private drawCursor(
    x: number,
    y: number,
    label: string,
    isLocal: boolean,
  ) {
    const ctx = this.ctx;

    /*
     * Cursor colors
     */
    const primary = isLocal
      ? "#818cf8"
      : "#fb7185";

    const secondary = isLocal
      ? "#38bdf8"
      : "#f43f5e";

    /*
     * Soft glow behind cursor
     */
    ctx.save();

    ctx.shadowColor = primary;
    ctx.shadowBlur = isLocal
      ? 18
      : 14;

    ctx.beginPath();

    ctx.arc(
      x + 5,
      y + 6,
      5,
      0,
      Math.PI * 2,
    );

    ctx.fillStyle = primary;

    ctx.fill();

    ctx.restore();

    /*
     * Cursor shape
     */
    ctx.save();

    ctx.beginPath();

    ctx.moveTo(
      x,
      y,
    );

    ctx.lineTo(
      x,
      y + 27,
    );

    ctx.lineTo(
      x + 7,
      y + 20,
    );

    ctx.lineTo(
      x + 14,
      y + 29,
    );

    ctx.lineTo(
      x + 19,
      y + 26,
    );

    ctx.lineTo(
      x + 12,
      y + 17,
    );

    ctx.lineTo(
      x + 22,
      y + 17,
    );

    ctx.closePath();

    /*
     * Cursor gradient
     */
    const gradient =
      ctx.createLinearGradient(
        x,
        y,
        x + 20,
        y + 25,
      );

    gradient.addColorStop(
      0,
      primary,
    );

    gradient.addColorStop(
      1,
      secondary,
    );

    ctx.fillStyle =
      gradient;

    ctx.shadowColor =
      primary;

    ctx.shadowBlur =
      isLocal ? 10 : 7;

    ctx.fill();

    /*
     * Thin dark outline
     */
    ctx.shadowBlur = 0;

    ctx.strokeStyle =
      "rgba(2, 6, 23, 0.95)";

    ctx.lineWidth = 2;

    ctx.stroke();

    ctx.restore();

    /*
     * Label
     */
    ctx.save();

    ctx.font =
      '600 13px Inter, Arial, sans-serif';

    const textWidth =
      ctx.measureText(label).width;

    const paddingX = 9;

    const labelWidth =
      textWidth +
      paddingX * 2;

    const labelHeight =
      24;

    const labelX =
      x + 25;

    const labelY =
      y - 5;

    /*
     * Label background
     */
    ctx.beginPath();

    this.roundRect(
      ctx,
      labelX,
      labelY,
      labelWidth,
      labelHeight,
      7,
    );

    ctx.fillStyle =
      "rgba(15, 23, 42, 0.92)";

    ctx.fill();

    /*
     * Colored border
     */
    ctx.strokeStyle =
      isLocal
        ? "rgba(129, 140, 248, 0.55)"
        : "rgba(251, 113, 133, 0.55)";

    ctx.lineWidth = 1;

    ctx.stroke();

    /*
     * Small colored indicator
     */
    ctx.beginPath();

    ctx.arc(
      labelX + 8,
      labelY + 12,
      3,
      0,
      Math.PI * 2,
    );

    ctx.fillStyle =
      primary;

    ctx.fill();

    /*
     * Label text
     */
    ctx.fillStyle =
      "#f8fafc";

    ctx.fillText(
      label,
      labelX + 16,
      labelY + 16,
    );

    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) {
    const r =
      Math.min(
        radius,
        width / 2,
        height / 2,
      );

    ctx.moveTo(
      x + r,
      y,
    );

    ctx.arcTo(
      x + width,
      y,
      x + width,
      y + height,
      r,
    );

    ctx.arcTo(
      x + width,
      y + height,
      x,
      y + height,
      r,
    );

    ctx.arcTo(
      x,
      y + height,
      x,
      y,
      r,
    );

    ctx.arcTo(
      x,
      y,
      x + width,
      y,
      r,
    );

    ctx.closePath();
  }
}