import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PointLabel } from "./PointLabel";

describe("PointLabel", () => {
  it("anchors center-attached compact-only pills at the badge center", () => {
    const { container } = render(
      <PointLabel
        content=""
        compactContent="14"
        collapse={true}
        hideMarker={true}
        fontSize="10px"
        labelAttach="center"
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-9.5px, -50%)");
  });

  it("keeps extended center-attached pills centered on the full badge", () => {
    const { container } = render(
      <PointLabel
        content="Point 14"
        labelStyle="capsule"
        hideMarker={true}
        fontSize="10px"
        labelAttach="center"
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-50%, -50%)");
  });
});
