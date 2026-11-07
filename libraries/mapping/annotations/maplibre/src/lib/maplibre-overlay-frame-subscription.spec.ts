import { describe, expect, it, vi } from "vitest";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import {
  readMapLibreOverlayFrameSubscription,
  registerMapLibreOverlayFrameSubscription,
} from "./maplibre-overlay-frame-subscription";

describe("MapLibre scene overlay frame binding", () => {
  it("registers only its engine, cleans up, and never changes other hosts", () => {
    const engine = {} as AnnotationEngine;
    const legacyEngine = {} as AnnotationEngine;
    const subscribe = vi.fn(() => () => undefined);
    expect(readMapLibreOverlayFrameSubscription(engine)).toBeUndefined();
    const dispose = registerMapLibreOverlayFrameSubscription(engine, subscribe);
    expect(readMapLibreOverlayFrameSubscription(engine)).toBe(subscribe);
    expect(readMapLibreOverlayFrameSubscription(legacyEngine)).toBeUndefined();
    dispose();
    expect(readMapLibreOverlayFrameSubscription(engine)).toBeUndefined();
  });
});
