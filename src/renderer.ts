import { getMedia, seekVideo } from "./media";
import { sceneAt, type Scene, type Settings } from "./timeline";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export async function drawFrame(
  canvas: HTMLCanvasElement,
  scenes: Scene[],
  settings: Settings,
  time: number,
): Promise<void> {
  const ctx = canvas.getContext("2d", { alpha: false });
  const scene = sceneAt(scenes, time);
  if (!ctx || !scene) return;
  const index = scenes.indexOf(scene);
  const elapsed = time - scene.start;
  const progress = clamp(elapsed / (scene.end - scene.start));
  const transition = Math.min(0.3, (scene.end - scene.start) * 0.3);
  async function paint(target: Scene, local: number, alpha: number) {
    const media = await getMedia(target.memory);
    if (media instanceof HTMLVideoElement)
      await seekVideo(
        media,
        Math.min(local, Math.max(0, target.memory.duration - 0.06)),
      );
    const { width, height } = target.memory;
    const zoom = 1.025 + clamp(local / (target.end - target.start)) * 0.065;
    const scale = Math.max(canvas.width / width, canvas.height / height) * zoom;
    ctx!.globalAlpha = alpha;
    ctx!.filter =
      settings.mood === "nostalgia"
        ? "sepia(24%) saturate(80%) contrast(94%)"
        : settings.mood === "dream"
          ? "saturate(75%) contrast(86%) blur(0.8px)"
          : "none";
    ctx!.drawImage(
      media,
      (canvas.width - width * scale) / 2,
      (canvas.height - height * scale) / 2,
      width * scale,
      height * scale,
    );
  }
  // Load the current frame before clearing the canvas, avoiding a black flash during decoding.
  await getMedia(scene.memory);
  ctx.fillStyle = "#090a09";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (index > 0 && elapsed < transition) {
    const previous = scenes[index - 1];
    await paint(previous, previous.end - previous.start - 0.05, 1);
    await paint(scene, elapsed, clamp(elapsed / transition));
  } else await paint(scene, elapsed, 1);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  const vignette = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.height * 0.12,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.72,
  );
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, "rgba(8, 7, 5, 0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (settings.grain) {
    ctx.fillStyle = "rgba(240,225,200,0.055)";
    // Stable per-frame texture makes preview and export use the same rendering.
    let seed = Math.floor(time * 12) + 13;
    for (let i = 0; i < 1300; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % canvas.width;
      seed = (seed * 16807) % 2147483647;
      const y = seed % canvas.height;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
  const fade =
    scene.phase === "opening"
      ? 1 - clamp(time / 1.15)
      : scene.phase === "ending"
        ? clamp((progress - 0.64) / 0.36)
        : 0;
  if (fade > 0) {
    ctx.fillStyle = `rgba(9,10,9,${fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
