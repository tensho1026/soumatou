import type { Memory } from "./timeline";
export const MAX_FILES = 24;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const DEMO_PHOTOS = [
  ["photo-1500530855697-b586d89ba3ee", "いつかの旅"],
  ["photo-1518837695005-2083093ee35b", "海の記憶"],
  ["photo-1470770841072-f978cf4d019e", "静かな朝"],
  ["photo-1470071459604-3b5ec3a7fe05", "深呼吸"],
  ["photo-1464822759023-fed622ff2c3b", "遠くへ"],
  ["photo-1493246507139-91e8fad9978e", "帰り道"],
];
const loaded = new Map<string, Promise<HTMLImageElement | HTMLVideoElement>>();
export function waitForEvent(
  element: HTMLVideoElement,
  event: string,
  timeout = 12000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(event, success);
      element.removeEventListener("error", failure);
    };
    const success = () => {
      cleanup();
      resolve();
    };
    const failure = () => {
      cleanup();
      reject(
        new Error(
          "この動画を読み込めません。対応する形式に変換して、もう一度お試しください。",
        ),
      );
    };
    const timer = setTimeout(failure, timeout);
    element.addEventListener(event, success, { once: true });
    element.addEventListener("error", failure, { once: true });
  });
}
export function getMedia(
  memory: Memory,
): Promise<HTMLImageElement | HTMLVideoElement> {
  const cached = loaded.get(memory.id);
  if (cached) return cached;
  const promise = (async () => {
    if (memory.kind === "image") {
      const image = new Image();
      image.src = memory.url;
      await image.decode();
      return image;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const ready = waitForEvent(video, "loadeddata");
    video.src = memory.url;
    await ready;
    return video;
  })();
  loaded.set(memory.id, promise);
  promise.catch(() => loaded.delete(memory.id));
  return promise;
}
export async function seekVideo(
  video: HTMLVideoElement,
  time: number,
): Promise<void> {
  const target = Math.max(0, Math.min(time, video.duration - 0.04));
  if (Math.abs(video.currentTime - target) < 0.018 && video.readyState >= 2)
    return;
  const ready = waitForEvent(video, "seeked");
  video.currentTime = target;
  await ready;
}
export async function importFile(file: File): Promise<Memory> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`${file.name}：100MB以内のファイルを選んでください。`);
  const kind = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : null;
  if (!kind || file.type === "image/svg+xml")
    throw new Error(
      `${file.name}：写真（JPEG・PNG・WebPなど）または動画を選んでください。`,
    );
  const memory: Memory = {
    id: crypto.randomUUID(),
    name: file.name,
    url: URL.createObjectURL(file),
    kind,
    duration: 0,
    width: 0,
    height: 0,
    favorite: false,
  };
  try {
    const media = await getMedia(memory);
    if (media instanceof HTMLVideoElement) {
      if (!Number.isFinite(media.duration) || media.duration <= 0)
        throw new Error("動画の長さを読み込めません。");
      memory.duration = media.duration;
      memory.width = media.videoWidth;
      memory.height = media.videoHeight;
    } else {
      memory.width = media.naturalWidth;
      memory.height = media.naturalHeight;
    }
    return memory;
  } catch {
    releaseMemory(memory);
    throw new Error(
      `${file.name}：読み込めない形式です。JPEG・PNG、またはMP4などに変換してお試しください。`,
    );
  }
}
export async function demoMemories(): Promise<Memory[]> {
  return Promise.all(
    DEMO_PHOTOS.map(async ([photo, name]) => {
      const memory: Memory = {
        id: `demo-${photo}`,
        name,
        url: `/demo/${photo}.jpg`,
        kind: "image",
        duration: 0,
        width: 0,
        height: 0,
        favorite: false,
        demo: true,
      };
      const image = (await getMedia(memory)) as HTMLImageElement;
      return {
        ...memory,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }),
  );
}
export function releaseMemory(memory: Memory): void {
  const pending = loaded.get(memory.id);
  pending
    ?.then((element) => {
      if (element instanceof HTMLVideoElement) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    })
    .catch(() => {});
  loaded.delete(memory.id);
  if (!memory.demo) URL.revokeObjectURL(memory.url);
}
