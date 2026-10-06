import { describe, expect, it } from "vitest";
import {
  getObliqueViewerExtension,
  type ObliqueViewerExtension,
} from "./oblique-viewer-extensions";

const extension: ObliqueViewerExtension = {
  mode: "objectCoverage",
  label: "Objektansichtenabfrage",
  Component: () => null,
};
describe("optional viewer mode resolution", () => {
  it("cannot activate a registered extension in the default UI", () => {
    expect(
      getObliqueViewerExtension([extension], false, "objectCoverage")
    ).toBeUndefined();
  });
  it("requires the matching addon even in the next UI", () => {
    expect(
      getObliqueViewerExtension([], true, "objectCoverage")
    ).toBeUndefined();
    expect(
      getObliqueViewerExtension([extension], true, "oblique")
    ).toBeUndefined();
    expect(
      getObliqueViewerExtension([extension], true, "nadir")
    ).toBeUndefined();
  });
  it("returns the host registration without rebuilding it", () => {
    expect(getObliqueViewerExtension([extension], true, "objectCoverage")).toBe(
      extension
    );
  });
});
