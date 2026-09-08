import * as THREE from "three";

type RegionDiagnostics = Readonly<{
  sourceId: string;
  ready: boolean;
  visitedNodes: number;
  broadPhaseNodes: number;
  rejectedPrismNodes: number;
  receiverPrismTested: boolean;
  selectedTileIds: readonly string[];
}>;

/** A review threshold, not a geometric limit. A long receiver, fine caster
 * cut or nearby tower can legitimately require more than ten tiles. Never
 * truncate the query or mark it ready based on this heuristic.
 */
export const auditShadowCorridor = ({
  id,
  casterBounds,
  sunElevationDegrees,
  regions,
  volumes,
}: {
  id: string;
  casterBounds: THREE.Box3;
  sunElevationDegrees: number;
  regions: readonly RegionDiagnostics[];
  volumes: readonly Readonly<{
    id: string;
    loadReason?: "viewport" | "shadow";
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }>[];
}) => {
  const selected = new Set(regions.flatMap((region) => region.selectedTileIds));
  const byId = new Map(volumes.map((volume) => [volume.id, volume]));
  const missing: string[] = [];
  const outsideEnvelope: string[] = [];
  let offscreen = 0;
  for (const tileId of selected) {
    const volume = byId.get(tileId);
    if (!volume) {
      missing.push(tileId);
      continue;
    }
    if (volume.loadReason === "shadow") offscreen += 1;
    if (
      !casterBounds.intersectsBox(
        new THREE.Box3(
          new THREE.Vector3(...volume.minimum),
          new THREE.Vector3(...volume.maximum)
        )
      )
    )
      outsideEnvelope.push(tileId);
  }
  return {
    id,
    ready: regions.length > 0 && regions.every((region) => region.ready),
    selectedTiles: selected.size,
    offscreenTiles: offscreen,
    // Includes receiver tiles; conservative upper bound on caster count.
    reviewCount: sunElevationDegrees >= 10 && selected.size > 10,
    nearHorizon: sunElevationDegrees < 10,
    exactPrismTested:
      regions.length > 0 &&
      regions.every((region) => region.receiverPrismTested),
    visitedNodes: regions.reduce((sum, region) => sum + region.visitedNodes, 0),
    broadPhaseNodes: regions.reduce(
      (sum, region) => sum + region.broadPhaseNodes,
      0
    ),
    rejectedPrismNodes: regions.reduce(
      (sum, region) => sum + region.rejectedPrismNodes,
      0
    ),
    missingPublishedVolumes: missing,
    outsideEnvelope,
    selectedTileIds: [...selected].sort(),
  };
};
