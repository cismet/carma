// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TileReserveCoverageStats } from "./TileReserveCoverageStats";

afterEach(cleanup);

const base = {
  known: 2,
  demanded: 1,
  resident: 1,
  renderable: 1,
  covered: 1,
  totalKnown: false,
  ratio: null,
  ready: false,
};

describe("reserve coverage stats", () => {
  it("shows unknown totals and waiting status instead of inferring readiness from known loaded tiles", () => {
    const { container } = render(
      <TileReserveCoverageStats
        presentationMode="progressive-mesh"
        baseCoverage={base}
        seamCoverage={base}
        closureCoverage={base}
        waitingForBase
      />
    );
    expect(container.textContent).toContain(
      "Whole-base geometry: 1/2 known regions covered · total unknown"
    );
    expect(container.textContent).toContain("WAITING FOR BASE");
    expect(container.textContent).toContain("Mode: Progressive mesh");
    expect(container.textContent).toContain(
      "Transition seam: 1/2 known payloads renderable"
    );
    expect(container.textContent).toContain("whole-ring total not certified");
    expect(container.textContent).not.toContain("100.0%");
  });

  it("keeps complete base geometry separate from incomplete compatible pan coverage", () => {
    const { container } = render(
      <TileReserveCoverageStats
        presentationMode="exclusive-shadow"
        baseCoverage={{
          ...base,
          covered: 2,
          totalKnown: true,
          ratio: 1,
          ready: true,
        }}
        seamCoverage={base}
        closureCoverage={{
          known: 2,
          covered: 1,
          totalKnown: true,
          ratio: 0.5,
          ready: false,
        }}
        waitingForBase
      />
    );
    expect(
      container.querySelector('[data-test-id="mesh-base-resolution-coverage"]')
        ?.textContent
    ).toContain("100.0%");
    expect(
      container.querySelector('[data-test-id="mesh-pan-reserve-coverage"]')
        ?.textContent
    ).toContain("50.0% · WAITING FOR BASE");
    expect(container.textContent).toContain("Mode: Exclusive shadow");
  });
});
