import { describe, expect, it } from "vitest";

import {
  SHOW_FORMAT,
  SHOW_VERSION,
  type Show,
} from "@carma-mapping/show-remote";

import { draftFromShow, showKeyFrom } from "./open-show";
import type { ShowDraft } from "./show-draft";

const NOW = "2026-09-25T12:00:00.000Z";

describe("showKeyFrom", () => {
  it("takes a typed key as it is, without the blanks around it", () => {
    expect(showKeyFrom("  abc123 ")).toBe("abc123");
  });

  it("reads the key from a remote link", () => {
    expect(
      showKeyFrom("https://example.org/pm-remote/?show=abc123&relay=XYZ")
    ).toBe("abc123");
  });

  it("finds nothing to open in an empty field, a link without a show or text with blanks", () => {
    expect(showKeyFrom("   ")).toBeNull();
    expect(showKeyFrom("https://example.org/pm-remote/?relay=XYZ")).toBeNull();
    expect(showKeyFrom("abc 123")).toBeNull();
  });
});

describe("draftFromShow", () => {
  const show: Show = {
    format: SHOW_FORMAT,
    version: SHOW_VERSION,
    title: "Hochwasser",
    publishedAt: "2026-09-20T08:00:00.000Z",
    scenes: [
      { id: "s1", title: "Szene 1", config: { layers: [{ id: "base" }] } },
      { id: "s2", title: "Szene 2", config: { layers: [{ id: "top" }] } },
    ],
  } as Show;

  // `as`: a draft may carry more than the fields every version of it has
  const current = {
    title: "Alt",
    scenes: [],
    excludedLayerIds: ["outline"],
    published: {
      key: "mine",
      at: "2026-09-19T08:00:00.000Z",
      sceneCount: 3,
      fingerprint: "x",
      editToken: "token",
    },
  } as ShowDraft;

  it("takes the show's title and scenes and keeps nothing else of the draft", () => {
    const draft = draftFromShow(show, "other", current, NOW);
    expect(draft.title).toBe("Hochwasser");
    expect(draft.scenes).toEqual(show.scenes);
    expect(Object.keys(draft).sort()).toEqual(["published", "scenes", "title"]);
  });

  it("keeps the edit token when this browser published the key", () => {
    expect(draftFromShow(show, "mine", current, NOW).published).toEqual({
      key: "mine",
      at: "2026-09-20T08:00:00.000Z",
      sceneCount: 2,
      editToken: "token",
    });
  });

  it("has no edit token for a show published elsewhere", () => {
    expect(draftFromShow(show, "other", current, NOW).published).toEqual({
      key: "other",
      at: "2026-09-20T08:00:00.000Z",
      sceneCount: 2,
    });
  });

  it("dates a show without a publish time to now", () => {
    const undated = { ...show, publishedAt: undefined } as unknown as Show;
    expect(draftFromShow(undated, "other", current, NOW).published?.at).toBe(
      NOW
    );
  });
});
