import { describe, expect, it } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import {
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
  it("finds the nearest diagonal center outside the 128 displayed nearest footprints", () => {
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
    expect(displayed).toHaveLength(128);
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
