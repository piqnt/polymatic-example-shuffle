import { CanvasSource, Texture } from "pixi.js";

/**
 * Textures are painted procedurally on a 2d canvas, so the example has no image assets.
 */

/** Board texture pixels per world unit. */
export const BOARD_RESOLUTION = 128;
/** Width of the gutter and rail around the board, in world units. */
export const BOARD_MARGIN = 0.5;
/** Width and height of puck textures, in pixels. */
const DISC_SIZE = 256;

const PLANKS = 8;
const GRAIN_LINES = 60;

/**
 * Varnished maple planks, in a dark gutter with a walnut rail around it.
 * The texture's top-left corner is at (left, top) in world coordinates.
 */
export function makeBoardTexture(width: number, height: number) {
  const k = BOARD_RESOLUTION;
  const m = BOARD_MARGIN;
  const w = width / 2;
  const h = height / 2;
  const left = -w - m;
  const top = h + m;
  const { canvas, ctx } = makeCanvas(Math.ceil((width + 2 * m) * k), Math.ceil((height + 2 * m) * k));
  const random = seeded(3);

  // draw in world units, y-axis up
  ctx.setTransform(k, 0, 0, -k, -left * k, top * k);

  // walnut rail
  ctx.fillStyle = "#4a2c18";
  ctx.fillRect(-w - m, -h - m, width + 2 * m, height + 2 * m);
  woodGrain(ctx, random, -w - m, -h - m, width + 2 * m, height + 2 * m, "rgba(30, 15, 5, 0.25)", 120);

  // gutter, shaded toward the board
  const g = m * 0.65;
  ctx.fillStyle = "#1a120c";
  ctx.fillRect(-w - g, -h - g, width + 2 * g, height + 2 * g);

  // planks along the x-axis, with staggered end joints
  const plank = height / PLANKS;
  for (let i = 0; i < PLANKS; i++) {
    const y = -h + i * plank;
    const hue = 32 + random() * 8;
    const light = 62 + random() * 8;
    ctx.fillStyle = `hsl(${hue}, 50%, ${light}%)`;
    ctx.fillRect(-w, y, width, plank);
    woodGrain(ctx, random, -w, y, width, plank, "rgba(130, 75, 30, 0.12)", GRAIN_LINES);

    const joint = -w + (0.2 + random() * 0.6) * width;
    ctx.beginPath();
    ctx.moveTo(joint, y);
    ctx.lineTo(joint, y + plank);
    ctx.strokeStyle = "rgba(70, 40, 15, 0.5)";
    ctx.lineWidth = 0.012;
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 1; i < PLANKS; i++) {
    ctx.moveTo(-w, -h + i * plank);
    ctx.lineTo(+w, -h + i * plank);
  }
  ctx.strokeStyle = "rgba(70, 40, 15, 0.6)";
  ctx.lineWidth = 0.012;
  ctx.stroke();

  addNoise(ctx, 10, random);

  // painted center line
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillRect(-0.03, -h, 0.06, height);

  // varnish sheen
  const sheen = ctx.createLinearGradient(-w, h, w, -h);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(1, "rgba(0, 0, 0, 0.1)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-w, -h, width, height);

  // lit edge of the board
  ctx.strokeStyle = "rgba(255, 235, 200, 0.5)";
  ctx.lineWidth = 0.03;
  ctx.strokeRect(-w + 0.015, -h + 0.015, width - 0.03, height - 0.03);

  return { texture: toTexture(canvas), left, top };
}

/** Shuffleboard puck: chrome rim, and a team colored cap with a groove and a printed mark. */
export function makePuckTexture(color: number) {
  const { canvas, ctx } = makeDiscCanvas();

  const rim = ctx.createRadialGradient(0, 0, 0.78, 0, 0, 1);
  rim.addColorStop(0, "#6f747b");
  rim.addColorStop(0.45, "#e9edf1");
  rim.addColorStop(1, "#5d6168");
  ctx.fillStyle = rim;
  ctx.fillRect(-1, -1, 2, 2);

  const cap = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.78);
  cap.addColorStop(0, css(color, 1.15));
  cap.addColorStop(1, css(color, 0.8));
  ctx.beginPath();
  ctx.arc(0, 0, 0.78, 0, 2 * Math.PI);
  ctx.fillStyle = cap;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, 0.58, 0, 2 * Math.PI);
  ctx.strokeStyle = css(color, 0.55);
  ctx.lineWidth = 0.04;
  ctx.stroke();

  // three spokes, so a spinning puck shows it
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    ctx.moveTo(0.18 * Math.cos(a), 0.18 * Math.sin(a));
    ctx.lineTo(0.42 * Math.cos(a), 0.42 * Math.sin(a));
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 0.09;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 0.97, 0, 2 * Math.PI);
  ctx.strokeStyle = "#2a2c30";
  ctx.lineWidth = 0.06;
  ctx.stroke();

  return toTexture(canvas);
}

/** Lighting, drawn over a puck and not rotated with it. */
export function makeShineTexture() {
  const { canvas, ctx } = makeDiscCanvas();

  const light = ctx.createLinearGradient(-0.7, -0.7, 0.7, 0.7);
  light.addColorStop(0, "rgba(255, 255, 255, 0.3)");
  light.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.25)");
  ctx.fillStyle = light;
  ctx.fillRect(-1, -1, 2, 2);

  const glint = ctx.createRadialGradient(-0.35, -0.4, 0, -0.35, -0.4, 0.45);
  glint.addColorStop(0, "rgba(255, 255, 255, 0.35)");
  glint.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glint;
  ctx.fillRect(-1, -1, 2, 2);

  return toTexture(canvas);
}

/** Wavy grain lines along the x-axis, clipped to the rect. */
function woodGrain(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  lines: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  for (let i = 0; i < lines; i++) {
    const y0 = y + random() * height;
    const amplitude = random() * height * 0.08;
    const frequency = 0.5 + random() * 1.5;
    const phase = random() * 2 * Math.PI;
    ctx.beginPath();
    for (let t = x; t <= x + width; t += 0.05) {
      const dy = amplitude * Math.sin(t * frequency + phase) + amplitude * 0.3 * Math.sin(t * frequency * 3.7);
      ctx.lineTo(t, y0 + dy);
    }
    ctx.lineWidth = 0.004 + random() * 0.012;
    ctx.stroke();
  }
  ctx.restore();
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Canvas for a disc texture, transformed to a unit circle at the center and clipped to it. */
function makeDiscCanvas() {
  const { canvas, ctx } = makeCanvas(DISC_SIZE, DISC_SIZE);
  ctx.setTransform(DISC_SIZE / 2, 0, 0, DISC_SIZE / 2, DISC_SIZE / 2, DISC_SIZE / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, 2 * Math.PI);
  ctx.clip();
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement) {
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
}

/** Adds grain to every painted pixel. */
function addNoise(ctx: CanvasRenderingContext2D, amount: number, random: () => number) {
  const { width, height } = ctx.canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const n = (random() - 0.5) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}

/** Color as css, with its brightness scaled. */
function css(color: number, brightness = 1) {
  const r = Math.min(255, ((color >> 16) & 0xff) * brightness);
  const g = Math.min(255, ((color >> 8) & 0xff) * brightness);
  const b = Math.min(255, (color & 0xff) * brightness);
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

/** Seeded random, so textures look the same on every load. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
