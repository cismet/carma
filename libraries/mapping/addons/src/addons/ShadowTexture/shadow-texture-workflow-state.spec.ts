import { describe, expect, it } from "vitest";

import { isShadowTextureWorkflowActive } from "./shadow-texture-workflow-state";

describe("isShadowTextureWorkflowActive", () => {
  it("matches only the requested background mode", () => {
    expect(isShadowTextureWorkflowActive(true, true, false, false)).toBe(true);
    expect(isShadowTextureWorkflowActive(true, true, true, false)).toBe(false);
    expect(isShadowTextureWorkflowActive(true, true, true, true)).toBe(true);
  });

  it("requires enabled shadows and the shadow-only presentation", () => {
    expect(isShadowTextureWorkflowActive(false, true, false, false)).toBe(
      false
    );
    expect(isShadowTextureWorkflowActive(true, false, false, false)).toBe(
      false
    );
  });

  it("does not match an incomplete preset or missing background state", () => {
    expect(isShadowTextureWorkflowActive(true, true, false, undefined)).toBe(
      false
    );
    expect(isShadowTextureWorkflowActive(true, true, undefined, false)).toBe(
      false
    );
  });
});
