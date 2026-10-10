import { describe, expect, it } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import {
  MAX_VISIBLE_FOOTPRINTS,
  footprintPointCandidates,
  indexViewportFootprints,
  selectFootprintAtPoint,
  selectViewportFootprints,
  type ViewportFootprint,
} from "./viewport-footprints";

const headingRad = degToRad(324 as Degrees);
const rectangle = (
  id: string,
  longitude: number,
  heading = headingRad,
  nadir = false
): ViewportFootprint => ({
  id,
  headingRad: heading,
  nadir,
  ring: [
    [longitude - 0.0004, 51.2696],
    [longitude + 0.0004, 51.2696],
    [longitude + 0.0004, 51.2704],
    [longitude - 0.0004, 51.2704],
    [longitude - 0.0004, 51.2696],
  ],
});

describe("catalog footprint hover", () => {
  it("prefers actual current-sector hits over a nearer axis crossing outside its polygon", () => {
    const containing = rectangle("containing", 7.2008);
    containing.ring = [
      [7.1999, 51.269],
      [7.204, 51.269],
      [7.204, 51.271],
      [7.1999, 51.271],
      [7.1999, 51.269],
    ];
    const index = indexViewportFootprints([
      containing,
      rectangle("nearby-without-hit", 7.2005),
      rectangle("other-sector-hit", 7.2, degToRad(144 as Degrees)),
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("containing");
  });

  it("keeps proximity ranking among actual hits in the current sector", () => {
    const index = indexViewportFootprints([
      rectangle("aligned-but-farther", 7.2003, headingRad),
      rectangle("nearer-sector-hit", 7.2, headingRad + Math.PI / 6),
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("nearer-sector-hit");
  });

  it("ranks covered images by their precomputed camera ground centres", () => {
    const farCameraCenter = rectangle("a-far-center", 7.2);
    const nearCameraCenter = rectangle("z-near-center", 7.2);
    farCameraCenter.groundCenter = [7.202, 51.27];
    nearCameraCenter.groundCenter = [7.2001, 51.27];
    expect(
      selectFootprintAtPoint(
        indexViewportFootprints([farCameraCenter, nearCameraCenter]),
        {
          point: [7.2, 51.27],
          headingRad,
          viewMode: "oblique",
        }
      )
    ).toBe("z-near-center");
  });

  it("falls back to every sector and ranks the shortest heading deviation before proximity", () => {
    const index = indexViewportFootprints([
      rectangle("nearer-but-90-degrees-away", 7.2006, degToRad(270 as Degrees)),
      rectangle("farther-but-50-degrees-away", 7.205, degToRad(310 as Degrees)),
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        headingRad: 0,
        viewMode: "oblique",
      })
    ).toBe("farther-but-50-degrees-away");
  });

  it("compares both heading directions across north before distance and active-image ties", () => {
    const index = indexViewportFootprints([
      rectangle("nearer-three-degrees", 7.2006, degToRad(2 as Degrees)),
      rectangle("farther-one-degree", 7.205, 0),
      rectangle("same-heading-active", 7.205, 0),
    ]);
    const query = {
      point: [7.2, 51.27] as [number, number],
      headingRad: degToRad(359 as Degrees),
      viewMode: "oblique" as const,
    };
    expect(selectFootprintAtPoint(index, query)).toBe("farther-one-degree");
    expect(
      selectFootprintAtPoint(index, {
        ...query,
        activeImageId: "same-heading-active",
      })
    ).toBe("same-heading-active");
  });

  it("uses distance to break heading ties and keeps nadir independent of bearing", () => {
    const index = indexViewportFootprints([
      rectangle("farther", 7.205, 0),
      rectangle("nearer", 7.201, 0),
      rectangle("nadir-farther", 7.205, 0, true),
      rectangle("nadir-nearer", 7.201, Math.PI, true),
    ]);
    const query = {
      point: [7.2, 51.27] as [number, number],
      headingRad: 0,
      viewMode: "oblique" as const,
    };
    expect(selectFootprintAtPoint(index, query)).toBe("nearer");
    expect(selectFootprintAtPoint(index, { ...query, viewMode: "nadir" })).toBe(
      "nadir-nearer"
    );
  });

  it("exposes all viewport sectors in gaps and reapplies the preferred sector at the pointer", () => {
    const index = indexViewportFootprints([
      rectangle("current-sector", 7.2),
      rectangle("other-sector", 7.203, degToRad(54 as Degrees)),
      rectangle("nadir", 7.202, 0, true),
    ]);
    const viewport = {
      corners: [
        [7.199, 51.269],
        [7.205, 51.269],
        [7.205, 51.271],
        [7.199, 51.271],
      ] as [number, number][],
      center: [7.2015, 51.27] as [number, number],
      headingRad,
      viewMode: "oblique" as const,
    };
    expect(selectViewportFootprints(index, viewport)).toEqual([
      "current-sector",
      "other-sector",
    ]);
    expect(
      selectViewportFootprints(index, { ...viewport, point: [7.2, 51.27] })
    ).toEqual(["current-sector"]);
    expect(
      selectViewportFootprints(index, { ...viewport, viewMode: "nadir" })
    ).toEqual(["nadir"]);
  });

  it("finds the nearest diagonal center outside the displayed nearest footprints", () => {
    const index = indexViewportFootprints(
      Array.from({ length: 160 }, (_, i) =>
        rectangle("image-" + i, 7.2 + i * 0.001)
      )
    );
    const displayed = selectViewportFootprints(index, {
      corners: [
        [7.199, 51.269],
        [7.37, 51.269],
        [7.37, 51.271],
        [7.199, 51.271],
      ],
      center: [7.2, 51.27],
      headingRad,
      viewMode: "oblique",
    });
    expect(displayed).toHaveLength(MAX_VISIBLE_FOOTPRINTS);
    expect(displayed).not.toContain("image-159");
    expect(
      selectFootprintAtPoint(index, {
        point: [7.359, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("image-159");
  });

  it("filters by view direction, viewport intersection and Nadir mode", () => {
    const index = indexViewportFootprints([
      rectangle("matching", 7.2),
      rectangle("opposite", 7.2, degToRad(144 as Degrees)),
      rectangle("nadir", 7.2, degToRad(0 as Degrees), true),
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("matching");
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        headingRad,
        viewMode: "nadir",
      })
    ).toBe("nadir");
    expect(
      selectFootprintAtPoint(index, {
        point: [7.25, 51.27],
        viewportCorners: [
          [7.24, 51.26],
          [7.26, 51.26],
          [7.26, 51.28],
          [7.24, 51.28],
        ],
        headingRad,
        viewMode: "oblique",
      })
    ).toBeNull();
  });

  it("rejects a footprint that only intersects the bounding box of a rotated viewport", () => {
    const index = indexViewportFootprints([rectangle("outside", 7.2)]);
    const viewportCorners: [number, number][] = [
      [7.20075, 51.27015],
      [7.20115, 51.27055],
      [7.20075, 51.27095],
      [7.20035, 51.27055],
    ];
    expect(
      selectFootprintAtPoint(index, {
        point: [7.2, 51.27],
        viewportCorners,
        headingRad,
        viewMode: "oblique",
      })
    ).toBeNull();
    expect(
      selectViewportFootprints(index, {
        corners: viewportCorners,
        center: [7.2, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toEqual([]);
  });
  it("ranks trapezoids by their diagonal crossing rather than their polygon centroid", () => {
    const index = indexViewportFootprints([
      {
        ...rectangle("trapezoid", 7.202),
        ring: [
          [7.2, 51.27],
          [7.204, 51.27],
          [7.203, 51.272],
          [7.201, 51.272],
          [7.2, 51.27],
        ],
      },
      {
        ...rectangle("rectangle", 7.202),
        ring: [
          [7.20195, 51.27095],
          [7.20205, 51.27095],
          [7.20205, 51.27105],
          [7.20195, 51.27105],
          [7.20195, 51.27095],
        ],
      },
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.202, 51.271333],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("trapezoid");
  });
  it("chooses the nearest image-axis intersection without requiring containment and prefers the active image on exact ties", () => {
    const index = indexViewportFootprints([
      rectangle("left", 7.2),
      rectangle("right", 7.2005),
      rectangle("right-active", 7.2005),
    ]);
    expect(
      selectFootprintAtPoint(index, {
        point: [7.202, 51.27],
        headingRad,
        viewMode: "oblique",
      })
    ).toBe("right");
    expect(
      selectFootprintAtPoint(index, {
        point: [7.202, 51.27],
        headingRad,
        viewMode: "oblique",
        activeImageId: "right-active",
      })
    ).toBe("right-active");
  });
});

describe("full-catalog photo-axis candidates", () => {
  it("returns every actual preferred-sector hit for surface ranking, beyond the display limit", () => {
    const actualHits = Array.from({ length: 160 }, (_, i) =>
      rectangle("hit-" + i, 7.2 + i * 0.000001)
    );
    const index = indexViewportFootprints([
      ...actualHits,
      rectangle("outside-polygon", 7.201),
      rectangle("opposite-direction", 7.2, degToRad(144 as Degrees)),
      rectangle("nadir", 7.2, headingRad, true),
    ]);
    const result = footprintPointCandidates(index, {
      point: [7.2, 51.27],
      headingRad,
      viewMode: "oblique",
    });
    expect(result.headingFirst).toBe(false);
    expect(result.ids).toHaveLength(160);
    expect(new Set(result.ids)).toEqual(
      new Set(actualHits.map((item) => item.id))
    );
    expect(result.ids[0]).toBe("hit-0");
  });

  it("returns all eligible viewport candidates across sectors in a gap with heading-first fallback", () => {
    const index = indexViewportFootprints([
      rectangle("closer-worse-heading", 7.201, degToRad(270 as Degrees)),
      rectangle("farther-best-heading", 7.204, degToRad(310 as Degrees)),
      rectangle("outside-viewport", 7.3, 0),
      rectangle("nadir", 7.202, 0, true),
    ]);
    const result = footprintPointCandidates(index, {
      point: [7.2, 51.27],
      headingRad: 0,
      viewMode: "oblique",
      viewportCorners: [
        [7.199, 51.269],
        [7.205, 51.269],
        [7.205, 51.271],
        [7.199, 51.271],
      ],
    });
    expect(result).toEqual({
      ids: ["farther-best-heading", "closer-worse-heading"],
      headingFirst: true,
    });
  });
});
