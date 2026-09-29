import { useEffect, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import type { CanvasImageStrip } from "@carma-commons/ui/components";
import { WUPPERTAL_CAMERA_CORRIDORS } from "@carma-commons/resources";
import {
  createCylinderCameraRig,
  createSpineCameraRig,
  createSharedSceneCameraStrip,
  type CameraRigView,
} from "@carma-mapping/engines/maplibre";
import {
  RATHAUS_PERIMETER,
  TILE_STRESS_PRESETS,
  WUPPER_BARMEN_NORTH_BANK,
  WUPPER_BARMEN_WATER_BOUNDARY,
} from "./tile-stress-presets";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";
import { coverageLabel } from "./use-tile-stress-world";

type CameraStrip = ReturnType<typeof createSharedSceneCameraStrip>;

export const useTileStressCameraRig = ({
  args,
  world,
  controls,
  presetName,
  customSpineKey,
  isLight,
  showBothSides,
  upperSide,
  elevationOffsetRef,
  stripCanvas,
  stripViewport,
  stripPresentation,
  oppositeViewport,
  oppositePresentation,
  oppositeStrip,
  navigationRange,
  arrayStrip,
  paintSegment,
  stripLabelHeight,
  setError,
  setStatus,
  setSegments,
  setStation,
  setStripLabels,
  setStripWidth,
}: {
  args: TileCameraStressArgs;
  world: World | null;
  controls: MutableRefObject<TileCameraStressArgs>;
  presetName: keyof typeof TILE_STRESS_PRESETS;
  customSpineKey: string;
  isLight: boolean;
  showBothSides: boolean;
  upperSide: 1 | -1;
  elevationOffsetRef: MutableRefObject<number>;
  stripCanvas: RefObject<HTMLCanvasElement>;
  stripViewport: RefObject<HTMLDivElement>;
  stripPresentation: MutableRefObject<CanvasImageStrip | null>;
  oppositeViewport: RefObject<HTMLDivElement>;
  oppositePresentation: MutableRefObject<CanvasImageStrip | null>;
  oppositeStrip: MutableRefObject<CameraStrip | null>;
  navigationRange: MutableRefObject<readonly [number, number] | null>;
  arrayStrip: MutableRefObject<CameraStrip | null>;
  paintSegment: (
    offset: number,
    pixels: Uint8Array,
    width: number,
    height: number
  ) => void;
  stripLabelHeight: number;
  setError: (error: string) => void;
  setStatus: (status: string) => void;
  setSegments: (segments: number) => void;
  setStation: (station: number) => void;
  setStripLabels: (labels: readonly { label: string; width: number }[]) => void;
  setStripWidth: (width: number) => void;
}) => {
  useEffect(() => {
    if (!world || isLight || !stripCanvas.current) return;
    setSegments(0);
    setStripLabels([]);
    setStation(0);
    if (stripViewport.current) stripViewport.current.scrollLeft = 0;
    let strip: ReturnType<typeof createSharedSceneCameraStrip>;
    let opposite: ReturnType<typeof createSharedSceneCameraStrip> | null = null;
    let footprintLabel = "";
    try {
      const preset = TILE_STRESS_PRESETS[presetName];
      const elevation = args.elevation || preset.elevation;
      const center = world.layer.projectLngLatToScene(preset.center, elevation);
      if (!center) return;
      let views: CameraRigView[];
      let oppositeViews: CameraRigView[] | null = null;
      if (args.scenario === "facade") {
        const coordinates =
          args.path === "custom"
            ? (JSON.parse(customSpineKey) as number[][])
            : args.path === "perimeter"
            ? RATHAUS_PERIMETER
            : args.path === "schwebebahn"
            ? WUPPERTAL_CAMERA_CORRIDORS.schwebebahn.crossSections.map(
                (section) => section.nearBank
              )
            : args.path === "urban-street"
            ? WUPPERTAL_CAMERA_CORRIDORS.street.coordinates
            : WUPPER_BARMEN_NORTH_BANK;
        if (coordinates.some((p) => p.length < 2 || !p.every(Number.isFinite)))
          throw new Error(
            "Spine requires finite [longitude, latitude] coordinates"
          );
        const spine = coordinates.map(
          ([lng, lat]) =>
            world.layer.projectLngLatToScene([lng, lat], elevation)!
        );
        const window =
          args.fitVertical &&
          args.path !== "custom" &&
          "verticalWindow" in preset
            ? preset.verticalWindow
            : null;
        const verticalRange = window
          ? ([
              world.layer.projectLngLatToScene(
                preset.center,
                window.minElevation
              )!.y,
              world.layer.projectLngLatToScene(
                preset.center,
                window.maxElevation
              )!.y,
            ] as const)
          : undefined;
        const rigOptions = {
          points: spine,
          closed: args.closed,
          count: args.cameraCount,
          height: args.viewHeight,
          baselineElevation: center.y,
          mergeAngleThreshold:
            args.path === "perimeter" && args.closed
              ? 0
              : degToRadNumeric(args.spineMergeAngleDegrees)!,
          closedFootprint:
            args.path === "perimeter" && args.closed
              ? {
                  clearance: Math.max(2, args.perimeterClearance ?? 3),
                  backPadding: args.backStreetMargin ?? 3,
                }
              : undefined,
          verticalRange,
          corridorFootprint:
            args.path === "schwebebahn" && !args.closed
              ? {
                  points:
                    WUPPERTAL_CAMERA_CORRIDORS.schwebebahn.crossSections.map(
                      (section) =>
                        world.layer.projectLngLatToScene(
                          section.farBank as [number, number],
                          elevation
                        )!
                    ),
                  backPadding: 8,
                  pairedToSpine: true,
                }
              : args.path === "wupper-bank" && !args.closed
              ? {
                  points: WUPPER_BARMEN_WATER_BOUNDARY.map(
                    ([lng, lat]) =>
                      world.layer.projectLngLatToScene([lng, lat], elevation)!
                  ),
                  backPadding: 8,
                }
              : undefined,
          verticalPadding: args.fitVertical ? args.verticalPadding : 0,
          offset: args.cameraOffset,
          referenceSurfaceOffset: args.referenceSurfaceOffset ?? 0,
          near: 0.1,
          far: args.far,
          clipBeforeSurface: args.clipBeforeSurface,
          side: upperSide,
          screenOrder: true,
        };
        views = createSpineCameraRig(rigOptions);
        if (showBothSides)
          oppositeViews = createSpineCameraRig({
            ...rigOptions,
            side: upperSide === 1 ? -1 : 1,
            upsideDown: true,
          });
      } else {
        views = createCylinderCameraRig({
          center,
          radius: args.radius,
          height: args.viewHeight,
          count: args.cameraCount,
          mode: args.mode,
          aspect: 1,
          verticalFieldOfView: degToRadNumeric(
            args.panoramaVerticalFovDegrees
          )!,
          pitch: degToRadNumeric(args.panoramaPitchDegrees)!,
          referenceDepth: args.objectReferenceDepth,
          near: 0.1,
          far: args.far,
        });
      }
      if (
        args.scenario === "facade" &&
        args.path === "perimeter" &&
        args.closed
      ) {
        const farPlanes = views.map((view) => view.camera.far);
        footprintLabel = ` · hull clearance ${Math.max(
          2,
          args.perimeterClearance ?? 3
        )} m · far ${Math.min(...farPlanes).toFixed(1)}–${Math.max(
          ...farPlanes
        ).toFixed(1)} m (+${args.backStreetMargin ?? 3} m behind hull)`;
      }
      setSegments(views.length);
      const canvas = stripCanvas.current;
      strip = createSharedSceneCameraStrip(world.layer, views, {
        viewport: stripViewport.current ?? undefined,
        height: args.segmentPixels,
        errorTargetPixels: args.pixelError,
        clipping: args.clipping,
        showImagePlanes: args.showImagePlanes,
        // Main MapLibre view stays PRIMARY; every array demand is SECONDARY.
        priorityCameraIndex: null,
        onError: (reason) => setError(String(reason)),
        onFrame: paintSegment,
      });
      arrayStrip.current = strip;
      navigationRange.current = args.visibleSegments
        ? [
            0,
            strip.layout.offsets[
              Math.min(views.length, args.visibleSegments)
            ] ?? strip.layout.width,
          ]
        : null;
      if (oppositeViews && oppositeViewport.current) {
        opposite = createSharedSceneCameraStrip(world.layer, oppositeViews, {
          viewport: oppositeViewport.current,
          height: args.segmentPixels,
          errorTargetPixels: args.pixelError,
          clipping: args.clipping,
          showImagePlanes: args.showImagePlanes,
          priorityCameraIndex: null,
          onFrame: () => {},
          onError: (reason) => setError(String(reason)),
        });
        oppositeStrip.current = opposite;
        opposite.setElevationOffset(elevationOffsetRef.current);
      }
      strip.setElevationOffset(elevationOffsetRef.current);
      canvas.width = strip.layout.width;
      canvas.height = strip.layout.height + stripLabelHeight;
      setStripWidth(strip.layout.width);
      let chainage = 0;
      setStripLabels(
        views.map((view, index) => {
          const direction = view.camera.getWorldDirection(new THREE.Vector3());
          const bearing =
            (radToDegNumeric(Math.atan2(direction.x, -direction.z))! + 360) %
            360;
          const start = chainage;
          chainage += view.stripWidthMeters ?? 0;
          const label =
            args.scenario === "facade"
              ? `${index + 1} · ${start.toFixed(0)} m`
              : `${index + 1} · ${bearing.toFixed(0)}°`;
          return {
            label,
            width: (100 * strip.layout.widths[index]) / strip.layout.width,
          };
        })
      );
      stripPresentation.current?.refresh();
      oppositePresentation.current?.refresh();
      stripPresentation.current?.resetView();
      oppositePresentation.current?.resetView();
      setError("");
    } catch (reason) {
      setStatus("Kamerakonfiguration ungültig · kein aktueller Bildstreifen");
      setError(String(reason));
      return;
    }
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (now - last >= 1000 / controls.current.previewUpdatesPerSecond) {
        last = now;
        strip.update();
        opposite?.update();
        const stats = strip.getStats();
        const pending = world.runtime.getRequestDemand?.() ?? 0;
        setStatus(
          `${stats.activeCameras}/${stats.cameras} active cameras${
            opposite ? ` + ${opposite.getStats().activeCameras} opposite` : ""
          } · 1 tile pool · ${pending} pending work · ${
            args.showImagePlanes
              ? "GPU viewports + GPU image planes · no readback"
              : "GPU viewports · no readback"
          } · ${coverageLabel(world)}${footprintLabel}`
        );
        world.map.triggerRepaint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (arrayStrip.current === strip) arrayStrip.current = null;
      strip.dispose();
      opposite?.dispose();
      if (oppositeStrip.current === opposite) oppositeStrip.current = null;
    };
  }, [
    world,
    args.visibleSegments,
    args.pairedSides,
    showBothSides,
    upperSide,
    isLight,
    args.scenario,
    presetName,
    args.cameraCount,
    args.mode,
    args.path,
    customSpineKey,
    args.closed,
    args.side,
    args.elevation,
    args.radius,
    args.viewHeight,
    args.fitVertical,
    args.spineMergeAngleDegrees,
    args.verticalPadding,
    args.panoramaVerticalFovDegrees,
    args.panoramaPitchDegrees,
    args.cameraOffset,
    args.referenceSurfaceOffset,
    args.objectReferenceDepth,
    args.perimeterClearance,
    args.backStreetMargin,
    args.clipBeforeSurface,
    args.clipping,
    args.showImagePlanes,
    args.far,
    args.pixelError,
    args.segmentPixels,
  ]);
};
