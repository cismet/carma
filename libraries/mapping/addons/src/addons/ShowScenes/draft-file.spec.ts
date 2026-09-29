import { describe, expect, it } from "vitest";

import {
  FIRST_STORY_ID,
  SHOW_FORMAT,
  SHOW_VERSION,
  packShow,
  type Show,
  type ShowScene,
} from "@carma-mapping/show-remote";

import {
  DRAFT_FILE_FORMAT,
  draftFileName,
  draftFileOf,
  draftFromFile,
} from "./draft-file";
import type { ShowDraft } from "./show-draft";

const NOW = "2026-09-29T19:30:00.000Z";

const scene = (id: string, story?: string): ShowScene => ({
  id,
  title: `Szene ${id}`,
  ...(story ? { story } : {}),
  config: { layers: [] } as unknown as ShowScene["config"],
});

const draft: ShowDraft = {
  title: "Zoo",
  stories: [{ id: "st1", title: "Natur und Umwelt" }],
  scenes: [scene("a", "st1"), scene("b", "st1")],
  excludedLayerIds: ["x"],
  excludedLayerIdsByScene: { a: ["y"] },
  published: {
    key: "k1",
    at: NOW,
    sceneCount: 2,
    fingerprint: "f",
    editToken: "t",
  },
};

const show: Show = {
  format: SHOW_FORMAT,
  version: SHOW_VERSION,
  title: "Veröffentlicht",
  publishedAt: NOW,
  scenes: [scene("c")],
};

describe("draftFileOf / draftFromFile", () => {
  it("gives back the whole draft, publish and edit token included", async () => {
    const file = draftFileOf(draft, NOW);
    expect(file.format).toBe(DRAFT_FILE_FORMAT);
    expect(file.savedAt).toBe(NOW);
    const read = await draftFromFile(JSON.parse(JSON.stringify(file)));
    expect(read).toEqual(draft);
  });

  it("makes a published show a draft without a publish", async () => {
    const read = await draftFromFile(show);
    expect(read?.title).toBe("Veröffentlicht");
    expect(read?.scenes.map((s) => s.id)).toEqual(["c"]);
    expect(read?.stories?.[0].id).toBe(FIRST_STORY_ID);
    expect(read?.published).toBeUndefined();
  });

  it("reads a published show as ceepr stores it packed", async () => {
    const read = await draftFromFile(await packShow(show));
    expect(read?.scenes.map((s) => s.id)).toEqual(["c"]);
  });

  it("finds no draft in other json", async () => {
    expect(await draftFromFile({ layers: [] })).toBeNull();
    expect(
      await draftFromFile({ format: DRAFT_FILE_FORMAT, version: 1, draft: {} })
    ).toBeNull();
    expect(await draftFromFile(null)).toBeNull();
  });
});

describe("draftFileName", () => {
  it("names the file after the title and the local time of the save", () => {
    const at = new Date(2026, 8, 29, 21, 5);
    expect(draftFileName({ ...draft, title: "Zoo: Natur/Umwelt?" }, at)).toBe(
      "Zoo- Natur-Umwelt-_2026-09-29_2105.json"
    );
  });

  it("falls back to a plain name for an empty title", () => {
    const at = new Date(2026, 8, 29, 9, 0);
    expect(draftFileName({ ...draft, title: "  " }, at)).toBe(
      "show_2026-09-29_0900.json"
    );
  });
});
