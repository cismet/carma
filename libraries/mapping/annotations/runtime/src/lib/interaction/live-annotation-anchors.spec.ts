import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it, vi } from "vitest";

import { createLiveAnnotationAnchors } from "./live-annotation-anchors";

describe("createLiveAnnotationAnchors", () => {
  it("keeps each visual host registry isolated", () => {
    const first = createLiveAnnotationAnchors(vi.fn());
    const second = createLiveAnnotationAnchors(vi.fn());
    const anchor = new Cartesian3(1, 2, 3);

    first.set("node-a", anchor);
    second.set("node-b", anchor);
    first.clear();

    expect(first.size).toBe(0);
    expect(second.get("node-b")).toBe(anchor);
  });

  it("invalidates consumers only when the registry changes", () => {
    const onChange = vi.fn();
    const anchors = createLiveAnnotationAnchors(onChange);

    anchors.clear();
    anchors.delete("missing");
    expect(onChange).not.toHaveBeenCalled();

    anchors.set("node-a", new Cartesian3(1, 2, 3));
    anchors.delete("node-a");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
