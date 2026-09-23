import { describe, expect, it } from "vitest";

import { TILES_LOAD_POLICY } from "./tile-load-config";
import {
  deriveTilePriority,
  resolveRequestConcurrency,
  shouldDeferTile,
} from "./tile-request-policy";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

describe("deriveTilePriority", () => {
  it("reaches initial visible quality ahead of caster and reserve work without delaying holes", () => {
    const base = {
      distanceFromCamera: 100,
      depth: 5,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 0,
    };
    const initial = deriveTilePriority({ ...base, improvesInitialView: true });
    expect(initial).toBeGreaterThan(
      deriveTilePriority({
        ...base,
        inMainFrustum: false,
        shadowReceiverCenterness: 1,
      })
    );
    expect(initial).toBeGreaterThan(
      deriveTilePriority({ ...base, inMainFrustum: false, isExtentFloor: true })
    );
    expect(initial).toBeLessThan(
      deriveTilePriority({ ...base, fillsViewCoverage: true })
    );
  });
  it("puts offscreen baseline repair after visible detail regardless of distance", () => {
    const floor = {
      distanceFromCamera: 0,
      depth: 1,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 1,
      isExtentFloor: true,
    };
    expect(deriveTilePriority(floor)).toBeLessThan(
      deriveTilePriority({
        ...floor,
        distanceFromCamera: 100_000,
        inMainFrustum: true,
        isExtentFloor: false,
      })
    );
    expect(
      deriveTilePriority({
        ...floor,
        inMainFrustum: true,
        fillsViewCoverage: true,
      })
    ).toBeGreaterThan(deriveTilePriority(floor));
  });
  it("prioritizes JSON, missing coverage, proven casters, then visible refinement", () => {
    const common = {
      distanceFromCamera: 1,
      depth: 30,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 1,
    };
    const detail = deriveTilePriority(common);
    const coverage = deriveTilePriority({
      ...common,
      distanceFromCamera: 10_000,
      fillsViewCoverage: true,
    });
    const metadata = deriveTilePriority({
      ...common,
      distanceFromCamera: Infinity,
      inMainFrustum: false,
      isExternalTileset: true,
    });
    const caster = deriveTilePriority({
      ...common,
      distanceFromCamera: Infinity,
      inMainFrustum: false,
      shadowReceiverCenterness: 0,
    });
    expect(metadata).toBeGreaterThan(coverage);
    expect(coverage).toBeGreaterThan(detail);
    expect(coverage).toBeGreaterThan(caster);
    expect(caster).toBeGreaterThan(detail);
  });
  it("orders mesh requests by observer distance, ahead of offscreen casters", () => {
    const priority = (distance: number, depth: number, inMainFrustum = true) =>
      deriveTilePriority({
        distanceFromCamera: distance,
        depth,
        inMainFrustum,
        isExternalTileset: false,
        centerness: 0,
      });
    expect(priority(10, 30)).toBeGreaterThan(priority(100, 1));
    expect(priority(10000, 30)).toBeGreaterThan(priority(0, 1, false));
    expect(priority(Infinity, 0)).toBeLessThan(priority(10000, 30));
  });
  it("orders the main view first, then hierarchy, external tilesets and centre", () => {
    const shallow = deriveTilePriority({
      depth: 3,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
    });
    const deepCentre = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: true,
      centerness: 1,
    });
    expect(deepCentre).toBeGreaterThan(shallow);

    const external = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: true,
      centerness: 0,
    });
    const mainCentre = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 1,
    });
    const mainEdge = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 0,
    });
    const margin = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
    });
    expect(mainCentre).toBeGreaterThan(mainEdge);
    expect(mainEdge).toBeGreaterThan(external);
    expect(external).toBeGreaterThan(margin);
  });

  it("orders shadow-only tiles by receiver relevance and then light depth", () => {
    const edgeReceiver = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.2,
      shadowLightFacing: 1,
    });
    const centreReceiverBehind = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.9,
      shadowLightFacing: 0,
    });
    const centreReceiverLightFacing = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.9,
      shadowLightFacing: 1,
    });

    expect(centreReceiverBehind).toBeGreaterThan(edgeReceiver);
    expect(centreReceiverLightFacing).toBeGreaterThan(centreReceiverBehind);
  });

  it("clamps depth and centerness", () => {
    expect(
      deriveTilePriority({
        depth: 500,
        inMainFrustum: false,
        isExternalTileset: false,
        centerness: 4,
      })
    ).toBe(
      deriveTilePriority({
        depth: 63,
        inMainFrustum: false,
        isExternalTileset: false,
        centerness: 1,
      })
    );
  });
});

describe("shouldDeferTile", () => {
  const displayable = {
    displayable: true,
    inView: false,
    inMargin: false,
    loadingState: 0,
    isDeferred: false,
  };

  it("defers unloaded displayable tiles outside the view and margin", () => {
    expect(shouldDeferTile(displayable)).toBe("defer");
  });

  it("keeps tiles that are in view, in the margin, loading or not displayable", () => {
    expect(shouldDeferTile({ ...displayable, inView: true })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, inMargin: true })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, loadingState: 2 })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, displayable: false })).toBe(
      "keep"
    );
    expect(shouldDeferTile({ ...displayable, isDeferred: true })).toBe("keep");
  });

  it("releases deferred tiles once they enter the view or margin", () => {
    expect(
      shouldDeferTile({ ...displayable, isDeferred: true, inView: true })
    ).toBe("undefer");
    expect(
      shouldDeferTile({ ...displayable, isDeferred: true, inMargin: true })
    ).toBe("undefer");
  });
});

describe("resolveRequestConcurrency", () => {
  it("pauses downloads under memory pressure even below the configured cache budget", () => {
    expect(
      resolveRequestConcurrency({
        configured: 16,
        ceilingBytes: 24 * GIB,
        cachedBytes: GIB,
        estimateBytes: MIB,
        memoryPressure: true,
      })
    ).toBe(0);
  });

  it("never keeps more requests in flight than the cache headroom admits", () => {
    expect(
      resolveRequestConcurrency({
        configured: 64,
        ceilingBytes: GIB,
        cachedBytes: GIB - 40 * MIB,
        estimateBytes: 4 * MIB,
      })
    ).toBe(10);
    expect(
      resolveRequestConcurrency({
        configured: 64,
        ceilingBytes: GIB,
        cachedBytes: GIB,
        estimateBytes: 4 * MIB,
      })
    ).toBe(TILES_LOAD_POLICY.minimumRequestConcurrency);
    expect(
      resolveRequestConcurrency({
        configured: 256,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 1,
      })
    ).toBe(TILES_LOAD_POLICY.maximumRequestConcurrency);
  });

  it("respects a caller limit below the floor and a cooldown of zero", () => {
    expect(
      resolveRequestConcurrency({
        configured: 2,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 4 * MIB,
      })
    ).toBe(2);
    expect(
      resolveRequestConcurrency({
        configured: 0,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 4 * MIB,
      })
    ).toBe(0);
  });
});

describe("foveated priority", () => {
  const base = {
    depth: 8,
    inMainFrustum: true,
    isExternalTileset: false,
    fillsViewCoverage: false,
  };

  it("keeps nearest-first order without a weight", () => {
    const near = deriveTilePriority({
      ...base,
      distanceFromCamera: 100,
      centerness: 0,
    });
    const far = deriveTilePriority({
      ...base,
      distanceFromCamera: 200,
      centerness: 1,
    });
    expect(near).toBeGreaterThan(far);
  });

  it("lets a centred tile overtake a nearer edge tile with a weight", () => {
    const edgeNear = deriveTilePriority({
      ...base,
      distanceFromCamera: 100,
      centerness: 0,
      foveationWeight: 4,
    });
    const centreFar = deriveTilePriority({
      ...base,
      distanceFromCamera: 200,
      centerness: 1,
      foveationWeight: 4,
    });
    expect(centreFar).toBeGreaterThan(edgeNear);
  });
});
