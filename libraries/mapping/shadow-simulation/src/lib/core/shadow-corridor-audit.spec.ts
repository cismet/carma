import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { auditShadowCorridor } from "./shadow-corridor-audit";

describe("corridor caster audit", () => {
  const input = {
    id: "receiver",
    casterBounds: new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 100, 100)
    ),
    sunElevationDegrees: 25,
    regions: [
      {
        sourceId: "mesh",
        ready: true,
        visitedNodes: 50,
        broadPhaseNodes: 20,
        rejectedPrismNodes: 7,
        receiverPrismTested: true,
        selectedTileIds: Array.from({ length: 12 }, (_, n) => String(n)),
      },
    ],
    volumes: Array.from({ length: 12 }, (_, n) => ({
      id: String(n),
      loadReason: "shadow" as const,
      minimum: [n, 0, 0] as const,
      maximum: [n + 1, 10, 10] as const,
    })),
  };
  it("flags over-ten without truncation or falsely changing readiness", () => {
    const result = auditShadowCorridor(input);
    expect(result.reviewCount).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.selectedTileIds).toHaveLength(12);
    expect(result.outsideEnvelope).toEqual([]);
    expect(
      auditShadowCorridor({ ...input, sunElevationDegrees: 4 }).reviewCount
    ).toBe(false);
  });
  it("distinguishes unavailable volume evidence from demonstrably wrong positions", () => {
    const result = auditShadowCorridor({
      ...input,
      volumes: [
        ...input.volumes.slice(2),
        {
          id: "0",
          loadReason: "shadow",
          minimum: [200, 0, 0],
          maximum: [201, 1, 1],
        },
      ],
    });
    expect(result.outsideEnvelope).toEqual(["0"]);
    expect(result.missingPublishedVolumes).toEqual(["1"]);
    expect(result.exactPrismTested).toBe(true);
  });
});
