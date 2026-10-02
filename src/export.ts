import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { dimensions, type Scene, type Settings } from "./timeline";
import { drawFrame } from "./renderer";
import { createScore } from "./audio";
export type ExportResult = {
  blob: Blob;
  extension: "mp4" | "webm";
  poster: string;
};
export async function exportFilm(
  scenes: Scene[],
  settings: Settings,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (!scenes.length) throw new Error("写真や動画を追加してください。");
  if (!("VideoEncoder" in window))
    throw new Error(
      "このブラウザは動画の書き出しに対応していません。最新のChrome・Edge・Safariでお試しください。",
    );
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = dimensions(settings.ratio, true);
  const videoOptions = {
    width: canvas.width,
    height: canvas.height,
    bitrate: 5_000_000,
  };
  const audioOptions = {
    numberOfChannels: 2,
    sampleRate: 44100,
    bitrate: 128_000,
  };
  const mp4 =
    (await canEncodeVideo("avc", videoOptions)) &&
    (settings.music === "none" || (await canEncodeAudio("aac", audioOptions)));
  const videoCodec = mp4 ? "avc" : "vp9";
  const audioCodec = mp4 ? "aac" : "opus";
  if (
    !mp4 &&
    (!(await canEncodeVideo("vp9", videoOptions)) ||
      (settings.music !== "none" &&
        !(await canEncodeAudio("opus", audioOptions))))
  )
    throw new Error(
      "動画を保存できるコーデックがありません。最新のChromeでお試しください。",
    );
  const output = new Output({
    target: new BufferTarget(),
    format: mp4
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat(),
  });
  const video = new CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: 5_000_000,
  });
  output.addVideoTrack(video, { frameRate: 30 });
  const audio =
    settings.music === "none"
      ? null
      : new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 });
  if (audio) output.addAudioTrack(audio);
  try {
    await output.start();
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    if (audio) {
      await audio.add(createScore(settings.duration, settings.music));
      audio.close();
    }
    const frames = Math.round(settings.duration * 30);
    let poster = "";
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new DOMException("Canceled", "AbortError");
      await drawFrame(canvas, scenes, settings, frame / 30);
      if (frame === 45) poster = canvas.toDataURL("image/jpeg", 0.8);
      await video.add(frame / 30, 1 / 30);
      if (frame % 15 === 0) {
        onProgress((frame / frames) * 0.96);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    video.close();
    await output.finalize();
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    onProgress(1);
    return {
      blob: new Blob([output.target.buffer!], {
        type: mp4 ? "video/mp4" : "video/webm",
      }),
      extension: mp4 ? "mp4" : "webm",
      poster,
    };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled")
      await output.cancel();
    throw error;
  }
}
