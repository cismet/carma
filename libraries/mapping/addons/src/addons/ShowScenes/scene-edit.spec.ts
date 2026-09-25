import { describe, expect, it } from "vitest";

import type { ShowScene } from "@carma-mapping/show-remote";

import {
  applyExclusionToAll,
  deleteStory,
  moveSceneInStory,
  moveSceneToStory,
  publishedScene,
  sceneExclusion,
} from "./scene-edit";
import type { ShowDraft } from "./show-draft";

const layers = (...ids: string[]) => ids.map((id) => ({ id }));

const idsOf = (config: ShowScene["config"]) =>
  config.layers.map(({ id }) => id);

describe("publishedScene", () => {
  const scene: ShowScene = {
    id: "s1",
    title: "Szene 1",
    config: { layers: layers("base", "outline", "top") },
  };

  it("leaves the excluded layers out", () => {
    const published = publishedScene(scene, new Set(["outline"]));
    expect(idsOf(published.config)).toEqual(["base", "top"]);
  });

  it("drops an empty text", () => {
    const published = publishedScene({ ...scene, text: "  " }, new Set());
    expect(published).not.toHaveProperty("text");
  });

  it("drops what an older draft still carries beyond the show format", () => {
    const stale = { ...scene, controls: [{ id: "c1" }] } as ShowScene;
    expect(publishedScene(stale, new Set())).not.toHaveProperty("controls");
  });
});

describe("applyExclusionToAll", () => {
  const draft: ShowDraft = {
    title: "Show",
    scenes: [
      { id: "a", title: "A", config: { layers: layers("x", "y") } },
      { id: "b", title: "B", config: { layers: layers("y", "z") } },
      { id: "c", title: "C", config: { layers: layers("z") } },
    ],
    excludedLayerIdsByScene: { a: ["x"], b: ["y", "z"] },
  };
  const initial = ["z"];

  it("gives every scene the source's choice for the source's layers", () => {
    const next = applyExclusionToAll(draft, "a", initial);
    expect(sceneExclusion(next, "a", initial)).toEqual(new Set(["x"]));
    // y is shown in A, so B shows it too; z is not A's business
    expect(sceneExclusion(next, "b", initial)).toEqual(new Set(["x", "z"]));
    // C had no list of its own and started from the initial one
    expect(sceneExclusion(next, "c", initial)).toEqual(new Set(["x", "z"]));
  });

  it("leaves the draft alone for an unknown scene", () => {
    expect(applyExclusionToAll(draft, "nope", initial)).toBe(draft);
  });
});

describe("stories", () => {
  const inStory = (id: string, story: string): ShowScene => ({
    id,
    title: id,
    story,
    config: { layers: [] },
  });
  const scenes = [
    inStory("a1", "a"),
    inStory("b1", "b"),
    inStory("a2", "a"),
    inStory("a3", "a"),
  ];
  const ids = (list: ShowScene[]) => list.map(({ id }) => id);

  it("moves a scene past the next scene of its own story only", () => {
    expect(ids(moveSceneInStory(scenes, "a1", 1))).toEqual([
      "a2",
      "b1",
      "a1",
      "a3",
    ]);
    expect(moveSceneInStory(scenes, "a3", 1)).toBe(scenes);
  });

  it("puts a scene moved to another story last in that story", () => {
    const moved = moveSceneToStory(scenes, "a1", "b");
    expect(ids(moved)).toEqual(["b1", "a2", "a3", "a1"]);
    expect(moved.at(-1)?.story).toBe("b");
  });

  it("deletes a story with its scenes and their exclusions", () => {
    const draft: ShowDraft = {
      title: "Show",
      stories: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
      scenes,
      excludedLayerIdsByScene: { a1: ["x"], b1: ["y"] },
    };
    const next = deleteStory(draft, "a");
    expect(next.stories).toEqual([{ id: "b", title: "B" }]);
    expect(ids(next.scenes)).toEqual(["b1"]);
    expect(next.excludedLayerIdsByScene).toEqual({ b1: ["y"] });
  });
});
