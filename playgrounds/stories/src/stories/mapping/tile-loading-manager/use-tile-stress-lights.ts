import { useEffect, type MutableRefObject, type RefObject } from "react";
import {
  createSharedSceneCameraStrip,
  createSharedScenePointLights,
  sampleOrbitLightPosition,
  type MapVectorPoint,
} from "@carma-mapping/engines/maplibre";
import { TILE_STRESS_PRESETS } from "./tile-stress-presets";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";
import { coverageLabel } from "./use-tile-stress-world";

export const useTileStressLights = (
  args: TileCameraStressArgs,
  world: World | null,
  controls: MutableRefObject<TileCameraStressArgs>,
  isLight: boolean,
  points: readonly MapVectorPoint[],
  stripCanvas: RefObject<HTMLCanvasElement>,
  paintSegment: (
    offset: number,
    pixels: Uint8Array,
    width: number,
    height: number
  ) => void,
  setError: (error: string) => void,
  setStatus: (status: string) => void,
  setSegments: (segments: number) => void,
  setStripLabels: (labels: readonly { label: string; width: number }[]) => void,
  setStripWidth: (width: number) => void
) => {
  useEffect(() => {
    if (
      !world ||
      (args.scenario !== "orbit" && args.scenario !== "streetlights")
    )
      return;
    let lights: ReturnType<typeof createSharedScenePointLights> | null = null;
    let lightViews: ReturnType<typeof createSharedSceneCameraStrip> | null =
      null;
    let raf = 0;
    let last = 0;
    let elapsed = 0;
    let lastShadowRevision = -1;
    const groundHeights = new Map<string, number>();
    const center = world.layer.projectLngLatToScene(
      TILE_STRESS_PRESETS["HKW chimney"].center,
      TILE_STRESS_PRESETS["HKW chimney"].elevation
    )!;
    const tick = (now: number) => {
      const current = controls.current;
      if (now - last >= 1000 / current.shadowUpdatesPerSecond) {
        try {
          const delta = last ? Math.min(0.25, (now - last) / 1000) : 0;
          last = now;
          if (current.animate) elapsed += delta;
          const positions =
            args.scenario === "orbit"
              ? Array.from({ length: 4 }, (_, index) =>
                  sampleOrbitLightPosition(center, index, 4, elapsed, {
                    radius: current.radius,
                    minHeight: current.lightMinHeight,
                    maxHeight: current.lightMaxHeight,
                    periodSeconds: current.orbitSeconds,
                  })
                )
              : points.flatMap((point) => {
                  const elevation =
                    groundHeights.get(point.id) ??
                    world.map.queryTerrainElevation(point.lngLat);
                  // Unknown is never silently treated as zero height.
                  if (elevation == null) return [];
                  groundHeights.set(point.id, elevation);
                  return [
                    world.layer.projectLngLatToScene(
                      point.lngLat,
                      elevation + current.mastHeight
                    )!,
                  ];
                });
          if (
            !lights &&
            positions.length &&
            (args.scenario === "orbit" || positions.length === points.length)
          ) {
            lights = createSharedScenePointLights(world.layer, {
              positions,
              intensity: current.lightIntensity,
              range: current.lightRange,
              shadowMapSize: current.shadowMapSize,
              errorTargetPixels: current.pixelError,
              maxShadowLights: current.shadowLightLimit,
              normalBias: current.normalBias,
              colors:
                args.scenario === "orbit"
                  ? ["#ff8855", "#66aaff", "#88ff88", "#ff66bb"]
                  : ["#ffe2b5"],
            });
            if (
              args.showLightViews &&
              stripCanvas.current &&
              lights.getShadowLightCount() > 0
            ) {
              const selected = Math.min(
                lights.getShadowLightCount() - 1,
                Math.max(0, Math.floor(args.viewLightIndex))
              );
              stripCanvas.current.width = args.segmentPixels * 6;
              stripCanvas.current.height = args.segmentPixels;
              setSegments(6);
              setStripWidth(args.segmentPixels * 6);
              setStripLabels(
                ["+X", "−X", "+Y", "−Y", "+Z", "−Z"].map((label) => ({
                  label,
                  width: 100 / 6,
                }))
              );
              lightViews = createSharedSceneCameraStrip(
                world.layer,
                lights
                  .getCameras()
                  .slice(selected * 6, (selected + 1) * 6)
                  .map((view) => ({ ...view, clipPlanes: [], distance: 1 })),
                {
                  height: args.segmentPixels,
                  errorTargetPixels: args.pixelError,
                  clipping: false,
                  showImagePlanes: false,
                  onFrame: paintSegment,
                  onError: (reason) => setError(String(reason)),
                }
              );
            }
          }
          if (args.scenario === "orbit" || positions.length === points.length)
            positions.forEach((position, index) =>
              lights?.setPosition(index, position)
            );
          if (lastShadowRevision !== world.contentRevision.current) {
            lights?.invalidateShadows();
            lastShadowRevision = world.contentRevision.current;
          }
          lightViews?.update();
          world.map.triggerRepaint();
          const pending = world.runtime.getRequestDemand?.() ?? 0;
          setStatus(
            `${lights ? positions.length : 0} lights / ${
              lights?.getShadowLightCount() ?? 0
            } shadow lights / ${
              lights?.getCameras().length ?? 0
            } shadow cameras · ${pending} pending work · ${coverageLabel(
              world
            )}${
              args.scenario === "streetlights"
                ? ` · ${points.length} BELIS points · mast height ${current.mastHeight} m assumed above DGM`
                : " · HKW fixture reference"
            }`
          );
        } catch (reason) {
          setError(String(reason));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lightViews?.dispose();
      lights?.dispose();
    };
  }, [
    world,
    isLight,
    args.scenario,
    points,
    args.lightIntensity,
    args.lightRange,
    args.shadowMapSize,
    args.pixelError,
    args.normalBias,
    args.showLightViews,
    args.viewLightIndex,
    args.segmentPixels,
    args.shadowLightLimit,
  ]);
};
