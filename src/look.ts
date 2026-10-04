export type LookAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  whiteHaze: number;
  softness: number;
  vignette: number;
};

export const DEFAULT_LOOK: LookAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  whiteHaze: 0,
  softness: 0,
  vignette: 60,
};

export const LOOK_CONTROLS: {
  key: keyof LookAdjustments;
  label: string;
  min: number;
  max: number;
  low: string;
  high: string;
}[] = [
  {
    key: "brightness",
    label: "明るさ",
    min: -50,
    max: 50,
    low: "暗く",
    high: "明るく",
  },
  {
    key: "contrast",
    label: "コントラスト",
    min: -50,
    max: 50,
    low: "やわらかく",
    high: "くっきり",
  },
  {
    key: "saturation",
    label: "鮮やかさ",
    min: -100,
    max: 100,
    low: "モノクロ",
    high: "鮮やかに",
  },
  {
    key: "warmth",
    label: "色温度",
    min: -100,
    max: 100,
    low: "青く・冷たく",
    high: "暖かく",
  },
  {
    key: "whiteHaze",
    label: "白ボケ",
    min: 0,
    max: 100,
    low: "なし",
    high: "白い霞・にじみ",
  },
  {
    key: "softness",
    label: "やわらかさ",
    min: 0,
    max: 100,
    low: "シャープ",
    high: "ふんわり",
  },
  {
    key: "vignette",
    label: "周辺の暗さ",
    min: 0,
    max: 100,
    low: "なし",
    high: "暗く",
  },
];

type LookBuffer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
const buffers = new WeakMap<HTMLCanvasElement, LookBuffer>();

// Grade the composited scene once, so the same look covers photos, videos and transitions.
// Scratch canvases are reused; blur radii scale with output size to match the preview.
export function applyLook(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  mood: "nostalgia" | "dream" | "clear",
  look: LookAdjustments,
): void {
  let buffer = buffers.get(canvas);
  if (!buffer) {
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d", { alpha: false });
    if (!scratchCtx) return;
    buffer = { canvas: scratch, ctx: scratchCtx };
    buffers.set(canvas, buffer);
  }
  if (
    buffer.canvas.width !== canvas.width ||
    buffer.canvas.height !== canvas.height
  ) {
    buffer.canvas.width = canvas.width;
    buffer.canvas.height = canvas.height;
  }
  const scale = Math.min(canvas.width, canvas.height) / 1080;
  const softness =
    ((look.softness / 100) * 6 + (mood === "dream" ? 1.2 : 0)) * scale;
  const base =
    mood === "nostalgia"
      ? "sepia(24%) saturate(80%) contrast(94%)"
      : mood === "dream"
        ? "saturate(75%) contrast(86%)"
        : "";
  buffer.ctx.drawImage(canvas, 0, 0);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter =
    `${base} brightness(${100 + look.brightness}%) contrast(${100 + look.contrast}%) saturate(${100 + look.saturation}%) blur(${softness}px)`.trim();
  // Overscan the already composited image slightly when blurring, avoiding dark edge halos.
  const bleed = softness * 3;
  ctx.drawImage(
    buffer.canvas,
    -bleed,
    -bleed,
    canvas.width + bleed * 2,
    canvas.height + bleed * 2,
  );
  ctx.filter = "none";
  if (look.warmth !== 0) {
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = (Math.abs(look.warmth) / 100) * 0.55;
    ctx.fillStyle = look.warmth > 0 ? "#ffbb65" : "#69b1ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const amount = look.whiteHaze / 100;
  if (amount > 0) {
    buffer.ctx.drawImage(canvas, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = amount * 0.32;
    ctx.filter = `blur(${10 * scale}px) brightness(125%)`;
    ctx.drawImage(
      buffer.canvas,
      -24 * scale,
      -24 * scale,
      canvas.width + 48 * scale,
      canvas.height + 48 * scale,
    );
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const glow = ctx.createRadialGradient(
      canvas.width * 0.3,
      canvas.height * 0.25,
      0,
      canvas.width * 0.3,
      canvas.height * 0.25,
      Math.hypot(canvas.width, canvas.height) * 0.85,
    );
    glow.addColorStop(0, `rgba(255,255,250,${amount * 0.44})`);
    glow.addColorStop(1, `rgba(255,255,255,${amount * 0.14})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
}
