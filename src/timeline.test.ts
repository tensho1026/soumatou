import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  buildTimeline,
  dimensions,
  sceneAt,
  type Memory,
} from "./timeline";

function fixtures(count: number): Memory[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `memory-${i}`,
    name: `Memory ${i}`,
    url: "/photo.jpg",
    kind: i % 2 === 0 ? "image" : "video",
    duration: 5,
    width: 1920,
    height: 1080,
    favorite: false,
  }));
}
describe("memory film", () => {
  it("covers the whole requested duration, without gaps or dropped memories", () => {
    for (const count of [1, 2, 6, 24])
      for (const duration of [15, 30, 60]) {
        const memories = fixtures(count);
        const scenes = buildTimeline(memories, {
          ...DEFAULT_SETTINGS,
          duration,
        });
        expect(scenes[0].start).toBe(0);
        expect(scenes.at(-1)?.end).toBe(duration);
        expect(new Set(scenes.map((scene) => scene.memory.id))).toEqual(
          new Set(memories.map((memory) => memory.id)),
        );
        scenes.forEach((scene, index) => {
          expect(scene.end).toBeGreaterThan(scene.start);
          if (index > 0) expect(scene.start).toBe(scenes[index - 1].end);
        });
      }
  });
  it("accelerates toward the final memory and gives the ending time to linger", () => {
    const scenes = buildTimeline(fixtures(6), DEFAULT_SETTINGS);
    const body = scenes.filter((scene) => scene.phase === "memories");
    for (let i = 1; i < body.length; i++)
      expect(body[i].end - body[i].start).toBeLessThanOrEqual(
        body[i - 1].end - body[i - 1].start + 1e-10,
      );
    expect(scenes.at(-1)!.end - scenes.at(-1)!.start).toBeGreaterThan(4);
  });
  it("holds starred memories longer without extending the film", () => {
    const memories = fixtures(6);
    const normal = buildTimeline(memories, DEFAULT_SETTINGS);
    memories[2].favorite = true;
    const starred = buildTimeline(memories, DEFAULT_SETTINGS);
    const total = (scenes: typeof normal) =>
      scenes
        .filter((scene) => scene.memory.id === "memory-2")
        .reduce((sum, scene) => sum + scene.end - scene.start, 0);
    expect(total(starred)).toBeGreaterThan(total(normal));
    expect(starred.at(-1)?.end).toBe(DEFAULT_SETTINGS.duration);
  });
  it("uses the chosen ending and falls back when it has been removed", () => {
    const memories = fixtures(6);
    expect(
      buildTimeline(memories, {
        ...DEFAULT_SETTINGS,
        endingId: memories[1].id,
      }).at(-1)?.memory.id,
    ).toBe(memories[1].id);
    expect(
      buildTimeline(memories, { ...DEFAULT_SETTINGS, endingId: "removed" }).at(
        -1,
      )?.memory.id,
    ).toBe(memories[5].id);
  });
  it("respects manual order across repeated memories", () => {
    const memories = fixtures(6).reverse();
    const body = buildTimeline(memories, {
      ...DEFAULT_SETTINGS,
      order: "selected",
    }).filter((scene) => scene.phase === "memories");
    body.forEach((scene, i) =>
      expect(scene.memory.id).toBe(memories[i % memories.length].id),
    );
  });
  it("selects the next scene exactly on a cut and the ending at film completion", () => {
    const scenes = buildTimeline(fixtures(6), DEFAULT_SETTINGS);
    expect(sceneAt(scenes, scenes[0].end)).toBe(scenes[1]);
    expect(sceneAt(scenes, 30)).toBe(scenes.at(-1));
    expect(buildTimeline([], DEFAULT_SETTINGS)).toEqual([]);
    expect(sceneAt([], 0)).toBeUndefined();
  });
  it("exports correctly proportioned 1080p frames", () => {
    expect(dimensions("landscape", true)).toEqual([1920, 1080]);
    expect(dimensions("portrait", true)).toEqual([1080, 1920]);
    expect(dimensions("square", true)).toEqual([1080, 1080]);
  });
});
