export type Memory = {
  id: string;
  name: string;
  url: string;
  kind: "image" | "video";
  duration: number;
  width: number;
  height: number;
  favorite: boolean;
  demo?: boolean;
};
export type Settings = {
  duration: number;
  ratio: "landscape" | "portrait" | "square";
  mood: "nostalgia" | "dream" | "clear";
  music: "piano" | "ambient" | "none";
  order: "mixed" | "selected";
  endingId: string;
  grain: boolean;
};
export type Scene = {
  memory: Memory;
  start: number;
  end: number;
  phase: "opening" | "memories" | "ending";
};
export const DEFAULT_SETTINGS: Settings = {
  duration: 30,
  ratio: "landscape",
  mood: "nostalgia",
  music: "piano",
  order: "mixed",
  endingId: "",
  grain: true,
};
export function dimensions(
  ratio: Settings["ratio"],
  full = false,
): [number, number] {
  const unit = full ? 120 : 80;
  return ratio === "portrait"
    ? [9 * unit, 16 * unit]
    : ratio === "square"
      ? [9 * unit, 9 * unit]
      : [16 * unit, 9 * unit];
}
// A stable interleaving lets the same memories return without changing on each render.
export function buildTimeline(memories: Memory[], settings: Settings): Scene[] {
  if (!memories.length) return [];
  const ending =
    memories.find((m) => m.id === settings.endingId) ??
    memories[memories.length - 1];
  const openingLength = settings.duration <= 15 ? 1.8 : 2.8;
  const endingLength = settings.duration <= 15 ? 2.8 : 4.5;
  const bodyLength = settings.duration - openingLength - endingLength;
  const arranged =
    settings.order === "selected"
      ? memories
      : memories
          .filter((_, i) => i % 2 === 0)
          .concat(memories.filter((_, i) => i % 2 === 1).reverse());
  const count = Math.max(memories.length, Math.floor(bodyLength / 1.25));
  const weights = Array.from({ length: count }, (_, i) => {
    const acceleration = 1.65 - (i / Math.max(1, count - 1)) * 1.05;
    return acceleration * (arranged[i % arranged.length].favorite ? 1.6 : 1);
  });
  const minimum = Math.min(0.4, bodyLength / count);
  const remaining = Math.max(0, bodyLength - minimum * count);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const scenes: Scene[] = [
    { memory: memories[0], start: 0, end: openingLength, phase: "opening" },
  ];
  let cursor = openingLength;
  weights.forEach((weight, i) => {
    const end = cursor + minimum + (weight / total) * remaining;
    scenes.push({
      memory: arranged[i % arranged.length],
      start: cursor,
      end,
      phase: "memories",
    });
    cursor = end;
  });
  scenes.push({
    memory: ending,
    start: cursor,
    end: settings.duration,
    phase: "ending",
  });
  return scenes;
}
export function sceneAt(scenes: Scene[], time: number): Scene | undefined {
  return (
    scenes.find((scene) => time >= scene.start && time < scene.end) ??
    scenes[scenes.length - 1]
  );
}
export function formatTime(time: number): string {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}`;
}
