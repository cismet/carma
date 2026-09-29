import { describe, expect, it } from "vitest";

import type { ShowScene } from "@carma-mapping/show-remote";

import {
  addStoryBaseLayers,
  applyExclusionToAll,
  copyLayerToScenes,
  deleteStory,
  moveSceneInStory,
  moveSceneToStory,
  publishedScene,
  publishedStory,
  removeSceneLayer,
  removeStoryBaseLayer,
  sceneExclusion,
  storyBaseLayers,
  withoutBaseLayers,
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

  it("takes the highlights along, without broken ones and without an empty list", () => {
    const highlight = {
      id: "h1",
      title: "Zoo",
      center: [791700, 6664800] as const,
      radiusMeters: 80,
      dim: 0.75,
    };
    const published = publishedScene(
      {
        ...scene,
        highlights: [highlight, { id: "h2" }] as ShowScene["highlights"],
      },
      new Set()
    );
    expect(published.highlights).toEqual([highlight]);
    expect(
      publishedScene({ ...scene, highlights: [] }, new Set())
    ).not.toHaveProperty("highlights");
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

describe("removeSceneLayer", () => {
  const draft: ShowDraft = {
    title: "Show",
    scenes: [
      { id: "a", title: "A", config: { layers: layers("x", "y") } },
      { id: "b", title: "B", config: { layers: layers("x") } },
    ],
    excludedLayerIdsByScene: { a: ["x", "y"], b: ["x"] },
  };

  it("takes the layer out of that scene and out of its exclusion list only", () => {
    const next = removeSceneLayer(draft, "a", "x");
    expect(idsOf(next.scenes[0].config)).toEqual(["y"]);
    expect(idsOf(next.scenes[1].config)).toEqual(["x"]);
    expect(next.excludedLayerIdsByScene).toEqual({ a: ["y"], b: ["x"] });
  });

  it("gives a scene without a list of its own none", () => {
    const withoutLists: ShowDraft = { title: "Show", scenes: draft.scenes };
    const next = removeSceneLayer(withoutLists, "a", "x");
    expect(next).not.toHaveProperty("excludedLayerIdsByScene");
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

describe("base layers", () => {
  const draft: ShowDraft = {
    title: "Show",
    stories: [
      { id: "bridge", title: "Brücke", baseLayers: layers("mask") },
      { id: "city", title: "Stadt" },
    ],
    scenes: [
      {
        id: "b1",
        title: "B1",
        story: "bridge",
        config: { layers: layers("x") },
      },
      {
        id: "b2",
        title: "B2",
        story: "bridge",
        config: { layers: layers("x", "y") },
      },
      { id: "c1", title: "C1", story: "city", config: { layers: [] } },
    ],
  };
  const baseIds = (next: ShowDraft, storyId: string) =>
    storyBaseLayers(next, storyId).map(({ id }) => id);

  it("adds new ones last and replaces a known one in its place", () => {
    const opaque = { id: "mask", opacity: 1 };
    const next = addStoryBaseLayers(draft, "bridge", [{ id: "top" }, opaque]);
    expect(baseIds(next, "bridge")).toEqual(["mask", "top"]);
    expect(storyBaseLayers(next, "bridge")[0]).toBe(opaque);
    expect(baseIds(next, "city")).toEqual([]);
  });

  it("drops the field with the last one removed", () => {
    const next = removeStoryBaseLayer(draft, "bridge", "mask");
    expect(next.stories?.[0]).toEqual({ id: "bridge", title: "Brücke" });
  });

  it("keeps a saved scene free of its story's base layers", () => {
    const config = { layers: layers("mask", "x") };
    expect(idsOf(withoutBaseLayers(config, layers("mask")))).toEqual(["x"]);
    expect(withoutBaseLayers(config, [])).toBe(config);
  });

  it("copies a layer on top of the scenes that lack it", () => {
    const { draft: next, count } = copyLayerToScenes(
      draft,
      { id: "y" },
      new Set(["b1", "b2"])
    );
    expect(count).toBe(1);
    expect(idsOf(next.scenes[0].config)).toEqual(["x", "y"]);
    expect(next.scenes[1]).toBe(draft.scenes[1]);
    expect(next.scenes[2]).toBe(draft.scenes[2]);
    expect(copyLayerToScenes(draft, { id: "x" }, new Set(["b1"]))).toEqual({
      draft,
      count: 0,
    });
  });

  it("publishes a story without the show-wide excluded base layers", () => {
    const story = {
      id: "bridge",
      title: "Brücke",
      baseLayers: layers("mask", "outline"),
    };
    expect(publishedStory(story, new Set(["outline"]))).toEqual({
      id: "bridge",
      title: "Brücke",
      baseLayers: layers("mask"),
    });
    expect(
      publishedStory(
        { ...story, baseLayers: layers("outline") },
        new Set(["outline"])
      )
    ).toEqual({ id: "bridge", title: "Brücke" });
  });
});
