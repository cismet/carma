import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import * as THREE from "three";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import {
  createCanvasImageStrip,
  CANVAS_IMAGE_STRIP_INITIAL_VIEW,
  type CanvasImageStrip,
} from "@carma-commons/ui/components";

import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPPERTAL_CAMERA_CORRIDORS,
} from "@carma-commons/resources";
import {
  buildSharedThreeSceneLayer,
  buildThreeTilesRuntime,
  buildRasterDemTerrainRuntime,
  createCylinderCameraRig,
  createSpineCameraRig,
  createSharedSceneCameraStrip,
  createSharedScenePointLights,
  createSharedSceneNightLightAtlas,
  createSharedSceneNightTraffic,
  type NightTrafficRoute,
  type NightLightAtlasInput,
  observeMapVectorPoints,
  sampleOrbitLightPosition,
  type SharedThreeSceneLayer,
  type SharedThreeSceneRuntime,
  type CameraRigView,
  type MapVectorPoint,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";

import {
  PUBLIC_BELIS_LIGHT_STYLE,
  RATHAUS_PERIMETER,
  REFERENCE_MESH_2024,
  WUPPER_BARMEN_NORTH_BANK,
  WUPPER_BARMEN_WATER_BOUNDARY,
  TILE_STRESS_PRESETS,
} from "./tile-stress-presets";

import "maplibre-gl/dist/maplibre-gl.css";
import "./tile-camera-stress.css";
import meshParityStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";
import {
  createWuppertalStoryStyle,
  WUPPERTAL_TERRAIN_SOURCE_ID,
} from "../maplibre/maplibre-story-style";
import {
  NIGHT_TRAFFIC_PATHS,
  NIGHT_TRAFFIC_SIGNALS,
} from "./data/night-traffic";
import { TileLoadingDebug } from "@carma-mapping/tile-diagnostics-ui";

export type TileCameraStressArgs = {
  scenario: "panorama" | "facade" | "orbit" | "streetlights" | "night-traffic";
  source: "mesh" | "terrain";
  preset: keyof typeof TILE_STRESS_PRESETS;
  cameraCount: number;
  mode: "panorama" | "object-cover";
  path: "perimeter" | "wupper-bank" | "schwebebahn" | "urban-street" | "custom";
  visibleSegments?: number;
  pairedSides?: boolean;
  streetView?: "left" | "right" | "both";
  upperStreetSide?: "left" | "right";
  closed: boolean;
  customSpine: number[][];
  side: 1 | -1;
  elevation: number;
  radius: number;
  viewHeight: number;
  panoramaVerticalFovDegrees: number;
  panoramaPitchDegrees: number;
  fitVertical: boolean;
  spineMergeAngleDegrees: number;
  verticalPadding: number;
  cameraOffset: number;
  referenceSurfaceOffset?: number;
  objectReferenceDepth?: number;
  perimeterClearance?: number;
  backStreetMargin?: number;
  clipBeforeSurface: number;
  clipping: boolean;
  showImagePlanes: boolean;
  far: number;
  pixelError: number;
  segmentPixels: number;
  previewUpdatesPerSecond: number;
  animate: boolean;
  lightCount: number;
  lightIntensity: number;
  lightRange: number;
  shadowMapSize: number;
  shadowLightLimit: number;
  shadowUpdatesPerSecond: number;
  lightMinHeight: number;
  lightMaxHeight: number;
  orbitSeconds: number;
  mastHeight: number;
  normalBias: number;
  showLightViews: boolean;
  viewLightIndex: number;
  nightCarCount?: number;
  nightLightStrength?: number;
  nightRailTraffic?: boolean;
};

type World = {
  map: maplibregl.Map;
  layer: SharedThreeSceneLayer;
  runtime: SharedThreeSceneRuntime;
  mesh: ThreeTilesRuntime | null;
  contentRevision: { current: number };
};

const coverageLabel = (world: World) => {
  const coverage = world.mesh?.loading.getCoverageStatus();
  if (!coverage)
    return `raster surface ${
      world.runtime.hasRenderableContent?.() ? "available" : "loading"
    }`;
  if (coverage.sourcePendingMetadata) return "source metadata loading";
  if (!coverage.floorArmed)
    return "visible base loading · extent floor not armed yet";
  if (!coverage.floorTotal) return "extent floor not discovered yet";
  return `floor ${coverage.floorLoaded}/${coverage.floorTotal} loaded · ${
    coverage.uncoveredFallbackRoots
  } missing/unknown fallback cuts · visible base ${
    coverage.visibleBaseReady ? "ready" : "refining"
  }`;
};

export function TileCameraStressDemo(args: TileCameraStressArgs) {
  const showBothSides =
    !!args.pairedSides && (args.streetView ?? "both") === "both";
  const upperSide: 1 | -1 = args.pairedSides
    ? args.streetView === "right" ||
      (showBothSides && args.upperStreetSide === "right")
      ? -1
      : 1
    : args.side;
  const isLongCorridor =
    args.path === "schwebebahn" || args.path === "urban-street";
  const container = useRef<HTMLDivElement>(null);
  const stripCanvas = useRef<HTMLCanvasElement>(null);
  const stripViewport = useRef<HTMLDivElement>(null);
  const stripPresentation = useRef<CanvasImageStrip | null>(null);
  const oppositeViewport = useRef<HTMLDivElement>(null);
  const oppositePresentation = useRef<CanvasImageStrip | null>(null);
  const oppositeStrip = useRef<ReturnType<
    typeof createSharedSceneCameraStrip
  > | null>(null);
  const navigationRange = useRef<readonly [number, number] | null>(null);
  const arrayStrip = useRef<ReturnType<
    typeof createSharedSceneCameraStrip
  > | null>(null);
  const [elevationOffset, setElevationOffset] = useState(0);
  const elevationOffsetRef = useRef(0);
  elevationOffsetRef.current = elevationOffset;
  const controls = useRef(args);
  controls.current = args;
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState("Loading shared scene…");
  const [error, setError] = useState("");
  const [points, setPoints] = useState<readonly MapVectorPoint[]>([]);
  const nightPoints = useRef(points);
  nightPoints.current = points;
  const nightSync = useRef<(() => void) | null>(null);
  const [station, setStation] = useState(0);
  const [segments, setSegments] = useState(0);
  const [stripLabels, setStripLabels] = useState<
    readonly { label: string; width: number }[]
  >([]);
  const [stripWidth, setStripWidth] = useState(0);
  const [stripScrollable, setStripScrollable] = useState(false);
  const isNight = args.scenario === "night-traffic";
  const isLight =
    args.scenario === "orbit" || args.scenario === "streetlights" || isNight;
  const showStrip = !isLight || args.showLightViews;
  const closedStrip = !isLight && (args.scenario !== "facade" || args.closed);
  const stripLabelHeight = 0;
  // Storybook clones object args on unrelated control changes. Only changed
  // coordinates of an active custom path should rebuild the camera rig.
  const customSpineKey = JSON.stringify(
    args.path === "custom" ? args.customSpine : []
  );
  const presetName =
    args.scenario === "orbit"
      ? "HKW chimney"
      : args.scenario === "facade" &&
        (args.path === "wupper-bank" || args.path === "schwebebahn")
      ? "Wupper north bank / Barmen"
      : args.scenario === "streetlights" || args.scenario === "facade"
      ? "Rathaus Barmen"
      : args.preset;
  const preset = TILE_STRESS_PRESETS[presetName];

  const paintSegment = (
    offset: number,
    pixels: Uint8Array,
    width: number,
    height: number
  ) => {
    const context = stripCanvas.current?.getContext("2d");
    if (!context) return;
    const frame = context.createImageData(width, height);
    for (let row = 0; row < height; row++)
      frame.data.set(
        pixels.subarray(
          (height - row - 1) * width * 4,
          (height - row) * width * 4
        ),
        row * width * 4
      );
    context.putImageData(frame, offset, stripLabelHeight);
    stripPresentation.current?.refresh();
  };

  // Camera count, clipping, lights and strip navigation never reconstruct the world.
  useEffect(() => {
    if (!container.current) return;
    setError("");
    const preset = TILE_STRESS_PRESETS[presetName];
    let disposed = false;
    // Fixture and DGM heights are used in the runtime's existing scene mount.
    // ECEF coordinates alone do not establish a mesh's vertical datum. Do not
    // add geoid undulation here: that would lift this already aligned mesh's
    // lights by another ~46 m. Datum validation belongs in the reference story.
    const map = new maplibregl.Map({
      container: container.current,
      center: isNight ? [7.201, 51.2707] : preset.center,
      zoom: isNight ? 16.1 : preset.zoom,
      pitch: 50,
      bearing: 0,
      attributionControl: {},
      style: {
        ...createWuppertalStoryStyle(null),
        terrain: { source: WUPPERTAL_TERRAIN_SOURCE_ID, exaggeration: 1 },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": isLight ? "#080b14" : "#aec4d4" },
          },
        ],
      },
    });
    map.addControl(new maplibregl.NavigationControl());
    const layer = buildSharedThreeSceneLayer("tile-stress-world", {
      ambientLightIntensity: isNight ? 0.12 : isLight ? 0.025 : 2,
    });
    const contentRevision = { current: 0 };
    const onContentChanged = () => {
      contentRevision.current++;
    };
    const mesh =
      args.source === "mesh"
        ? buildThreeTilesRuntime(
            "mesh-2024",
            REFERENCE_MESH_2024,
            preset.center,
            {
              providesTerrain: true,
              shadowBuildingStyle: true,
              // Long sliding corridors should recycle local coverage, not fill
              // a 6 GiB citywide reserve while the user inspects a few sections.
              cacheBudgetBytes: (isLongCorridor ? 1.5 : 6) * 1024 ** 3,
              entry: meshParityStyle.metadata.carmaConf["3d"].entry,
              baseErrorTargetPixels:
                meshParityStyle.metadata.carmaConf["3d"].baseErrorTarget,
              diagnostics: false,
              outline: false,
              mapStyleDrape: "none",
              onContentChanged,
            }
          )
        : null;
    const runtime =
      mesh?.scene ??
      buildRasterDemTerrainRuntime(
        "terrarium",
        NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
        preset.center,
        {
          errorTargetPixels: controls.current.pixelError,
          receivesMapStyleTexture: false,
          material: { color: "#c5c4bd" },
          onError: (reason) => setError(String(reason)),
          onContentChanged,
        }
      );
    // Mesh JPEG colour is retained, but its unlit glTF material must accept lights.
    // No cartographic overlay in this diagnostic: otherwise the background-only
    // MapLibre style is draped over the reference mesh's own JPEG textures.
    runtime.receivesMapStyleTexture = false;
    runtime.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    layer.addRuntime(runtime);
    if (!isLight) {
      const sun = new THREE.DirectionalLight(0xffffff, 2);
      sun.position.set(-300, 600, 200);
      layer.getScene().add(sun);
    }
    map.once("load", () => {
      map.addLayer(layer);
      if (!disposed) setWorld({ map, layer, runtime, mesh, contentRevision });
    });
    const onError = (event: maplibregl.ErrorEvent) =>
      setError(event.error.message);
    map.on("error", onError);
    return () => {
      disposed = true;
      setWorld(null);
      map.off("error", onError);
      map.remove();
      layer.dispose();
    };
  }, [args.source, presetName, isLight, isNight, isLongCorridor]);

  useEffect(() => {
    world?.runtime.setErrorTarget?.(args.pixelError);
  }, [world, args.pixelError]);

  useEffect(() => {
    arrayStrip.current?.setElevationOffset(elevationOffset);
    oppositeStrip.current?.setElevationOffset(elevationOffset);
    world?.map.triggerRepaint();
  }, [world, elevationOffset]);

  useEffect(() => {
    setElevationOffset(0);
  }, [world, args.elevation]);

  useEffect(() => {
    if (!world || (args.scenario !== "streetlights" && !isNight)) return;
    setPoints([]);
    return observeMapVectorPoints(world.map, PUBLIC_BELIS_LIGHT_STYLE, {
      idPrefix: "public-belis",
      center: TILE_STRESS_PRESETS["Rathaus Barmen"].center,
      radiusMeters: isNight ? 900 : 350,
      limit: args.lightCount,
      onPoints: setPoints,
      onError: (reason) => setError(String(reason)),
    });
  }, [world, args.scenario, args.lightCount, isNight]);

  useEffect(() => {
    nightSync.current?.();
  }, [points]);

  useEffect(() => {
    if (!world || !isNight) return;
    let disposed = false;
    let atlasStatus = "Warte auf BELIS-Leuchten und Geländehöhen";
    const atlas = createSharedSceneNightLightAtlas(
      world.layer.getScene(),
      (message) => {
        atlasStatus = message;
        world.map.triggerRepaint();
      },
      (reason) => {
        if (!disposed) setError(String(reason));
      }
    );
    let traffic: ReturnType<typeof createSharedSceneNightTraffic> | null = null;
    const heights = new Map<string, number>();
    let lampSignature = "";
    let routeSignature = "";
    let pendingRouteCount = NIGHT_TRAFFIC_PATHS.length;
    let lastRevision = -1;
    let elapsed = 0;
    let last = 0;
    let lastStatus = 0;
    let raf = 0;
    let syncFrame = 0;
    const ground = (coordinate: readonly [number, number]) => {
      const key = coordinate.join(",");
      const known = heights.get(key);
      if (known !== undefined) return known;
      const value = world.map.queryTerrainElevation([...coordinate]);
      if (value == null || !Number.isFinite(value)) return null;
      heights.set(key, value);
      return value;
    };
    const sync = () => {
      if (disposed) return;
      const lamps: NightLightAtlasInput["lights"][number][] = [];
      const center = world.layer.projectLngLatToScene(
        TILE_STRESS_PRESETS["Rathaus Barmen"].center
      )!;
      const color = new THREE.Color("#ffda91");
      for (const point of nightPoints.current) {
        const elevation = ground(point.lngLat);
        if (elevation == null) continue;
        const position = world.layer.projectLngLatToScene(
          point.lngLat,
          elevation + args.mastHeight
        )!;
        const surface = world.layer.projectLngLatToScene(
          point.lngLat,
          elevation
        )!;
        lamps.push({
          position: [position.x, position.y, position.z],
          groundHeight: surface.y,
          radius: 28,
          color: [color.r, color.g, color.b],
          strength: args.nightLightStrength ?? 0.55,
        });
      }
      const signature = lamps.map((lamp) => lamp.position.join(",")).join(";");
      if (signature !== lampSignature) {
        lampSignature = signature;
        atlas.setLights({
          resolution: 1024,
          bounds: [
            center.x - 950,
            center.z - 950,
            center.x + 950,
            center.z + 950,
          ],
          heightRange: [
            Math.min(...lamps.map((lamp) => lamp.groundHeight), 0),
            Math.max(...lamps.map((lamp) => lamp.groundHeight), 1),
          ],
          lights: lamps,
        });
      }
      const routes: NightTrafficRoute[] = [];
      const requestedPaths = NIGHT_TRAFFIC_PATHS.filter(
        (path) => args.nightRailTraffic !== false || path.kind === "car"
      );
      for (const path of requestedPaths) {
        const routePoints: THREE.Vector3[] = [];
        for (const coordinate of path.coordinates) {
          const elevation = ground(coordinate);
          if (elevation == null) break;
          // No z claim in OSM: cars/rail use DGM; suspended track is an explicit
          // 13 m visual assumption, not the measured VehicleAnimation track.
          routePoints.push(
            world.layer.projectLngLatToScene(
              [...coordinate],
              elevation + (path.kind === "schwebebahn" ? 13 : 0.35)
            )!
          );
        }
        if (routePoints.length !== path.coordinates.length) continue;
        const signal = NIGHT_TRAFFIC_SIGNALS.find(
          (entry) => entry.pathId === path.id
        );
        const signalIndex = signal
          ? path.coordinates.findIndex(
              (coordinate) =>
                coordinate[0] === signal.coordinate[0] &&
                coordinate[1] === signal.coordinate[1]
            )
          : -1;
        let signalDistance = 0;
        for (let index = 1; index <= signalIndex; index++) {
          const a = routePoints[index - 1],
            b = routePoints[index];
          signalDistance += Math.hypot(b.x - a.x, b.z - a.z);
        }
        routes.push({
          id: path.id,
          kind: path.kind,
          points: routePoints,
          speedMetersPerSecond:
            path.kind === "car" ? 7 : path.kind === "schwebebahn" ? 9 : 14,
          ...(signalIndex >= 0
            ? {
                signal: {
                  distanceMeters: signalDistance,
                  phaseOffsetSeconds: routes.length * 8,
                },
              }
            : {}),
        });
      }
      pendingRouteCount = requestedPaths.length - routes.length;
      const nextRouteSignature = routes.map((route) => route.id).join(";");
      if (nextRouteSignature !== routeSignature) {
        routeSignature = nextRouteSignature;
        traffic?.dispose();
        traffic = createSharedSceneNightTraffic(world.layer.getScene(), {
          routes,
          carCount: args.nightCarCount ?? 3,
        });
      }
    };
    const scheduleSync = () => {
      if (disposed || syncFrame) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0;
        sync();
      });
    };
    nightSync.current = scheduleSync;
    world.map.on("sourcedata", scheduleSync);
    sync();
    const tick = (now: number) => {
      if (disposed) return;
      const delta = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (controls.current.animate && !document.hidden) elapsed += delta;
      traffic?.update(elapsed);
      if (world.contentRevision.current !== lastRevision) {
        lastRevision = world.contentRevision.current;
        atlas.reconcile(world.runtime.root);
      }
      if (now - lastStatus > 500) {
        lastStatus = now;
        setStatus(
          `Barmen-Nacht · ${atlasStatus} · ${
            traffic?.vehicleCount ?? 0
          } Fahrzeuge / ${
            traffic?.signalCount ?? 0
          } Ampeln · ${pendingRouteCount} Routen warten auf DGM · ${coverageLabel(
            world
          )}`
        );
      }
      world.map.triggerRepaint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      nightSync.current = null;
      world.map.off("sourcedata", scheduleSync);
      cancelAnimationFrame(syncFrame);
      cancelAnimationFrame(raf);
      traffic?.dispose();
      atlas.dispose();
    };
  }, [
    world,
    isNight,
    args.nightCarCount,
    args.nightRailTraffic,
    args.nightLightStrength,
    args.mastHeight,
  ]);

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

  useEffect(() => {
    const viewport = stripViewport.current;
    const source = stripCanvas.current;
    if (!showStrip || !viewport || !source) return;
    let lastFollowX: number | undefined;
    let lastFollowWidth: number | undefined;
    const presentation = createCanvasImageStrip(viewport, source, {
      initialRange: () => navigationRange.current,
      onDraw: isLight
        ? undefined
        : (frame) => arrayStrip.current?.setPresentation(frame),
      closedLoop: closedStrip,
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.FIT,
      ariaLabel: "Pan and zoom camera image strip",
      onViewChange: (view) => {
        oppositePresentation.current?.setView({
          ...view,
          centerY: view.sourceHeight - view.centerY,
        });
        setStation(view.position);
        setStripScrollable(
          view.closedLoop ||
            view.sourceWidth * view.scale > view.viewportWidth + 1
        );
        const path = controls.current.path;
        if (world && (path === "schwebebahn" || path === "urban-street")) {
          const width = view.viewportWidth / view.scale;
          if (lastFollowX !== view.centerX || lastFollowWidth !== width) {
            const target = arrayStrip.current?.getMapViewAt(
              view.centerX,
              width
            );
            if (target) {
              lastFollowX = view.centerX;
              lastFollowWidth = width;
              world.map.easeTo({ ...target, duration: 350 });
            }
          }
        } else if (controls.current.visibleSegments && world) {
          const position = arrayStrip.current?.getScenePositionAt(view.centerX);
          const center = position && world.layer.projectSceneToLngLat(position);
          if (center) world.map.setCenter(center);
        }
      },
      onElevationDelta: isLight
        ? undefined
        : (delta) => {
            // Vertical drag sensitivity follows the currently displayed facade
            // scale; camera-space translation itself belongs to the shared strip.
            const view = presentation.getView();
            const metresPerPixel =
              controls.current.viewHeight /
              Math.max(1, (view.sourceHeight - stripLabelHeight) * view.scale);
            setElevationOffset((value) => value + delta * metresPerPixel);
          },
    });
    stripPresentation.current = presentation;
    const opposite =
      showBothSides && oppositeViewport.current
        ? createCanvasImageStrip(oppositeViewport.current, source, {
            initialRange: () => navigationRange.current,
            onDraw: (frame) => oppositeStrip.current?.setPresentation(frame),
            ariaLabel:
              "Opposite street side · unfolded downward, synchronized station",
            onViewChange: (view) =>
              presentation.setView({
                ...view,
                centerY: view.sourceHeight - view.centerY,
              }),
          })
        : null;
    oppositePresentation.current = opposite;
    return () => {
      if (stripPresentation.current === presentation)
        stripPresentation.current = null;
      presentation.dispose();
      opposite?.dispose();
      if (oppositePresentation.current === opposite)
        oppositePresentation.current = null;
    };
  }, [
    showStrip,
    isLight,
    closedStrip,
    stripLabelHeight,
    args.pairedSides,
    showBothSides,
    upperSide,
    world,
  ]);

  useEffect(() => {
    stripPresentation.current?.refresh();
    oppositePresentation.current?.refresh();
  }, [stripWidth]);

  const navigate = (value: number) => {
    setStation(value);
    stripPresentation.current?.setPosition(value);
  };
  const reviewContent = (
    <aside className="tile-stress-review" data-test-id="tile-stress-review">
      <strong>Review erforderlich: </strong>
      {isNight
        ? "Lokale Barmen-Nachtszene: BELIS-Standorte und OSM-Wege, aber synthetischer Verkehr und Ampelphasen. Feste Lichtfelder sind im Worker gebacken, ohne Gebäude-Verdeckung; keine zertifizierte Licht-/Schattenberechnung. Stadtweit deaktiviert: vollständige Leuchtenabdeckung und Verdeckungsbudget sind nicht belegt."
        : isLight
        ? "Lichtansichten sind einzelne Cube-Faces, kein zusammenhängendes Panorama. Bewegte Frames entstehen nacheinander; keine synchrone Sichtbarkeitsmessung."
        : args.scenario === "facade"
        ? args.path === "schwebebahn"
          ? "Gesamte Schwebebahn: Querblick zwischen OSM-Ufern; wo keine sichere Wasserfläche vorliegt, angenommener Straßenkorridor (±12 m). Gemeinsame Höhenbasis für die ganze Wand, keine segmentweise Geländeanpassung. Nur sichtbare Segmente sind aktive Kameras; Ziehen verschiebt das Fenster entlang der Strecke."
          : args.path === "urban-street"
          ? "B7-Talachse: Straßenseiten einzeln oder synchron aufgeklappt, mit gemeinsamer Höhenbasis. Straßenbreite und Fassadenhöhen sind nicht vermessen. Kein belegtes Verkehrsstärke-Ranking."
          : args.path === "perimeter"
          ? "Rathaus: nach außen versetzte ALKIS-Hülllinie, hinten je Streifen knapp hinter dem Gebäude begrenzt. Dachüberstände sind nicht vermessen; Rücksprünge und Innenhöfe bleiben vereinfacht."
          : args.path === "wupper-bank"
          ? "Blick vom Nordufer quer über die Wupper: Tiefe je Streifen bis zum Gegenufer plus 8 m Brückenrand. Höhenfenster 145–185 m geschätzt; Brückenränder sind nicht vermessen."
          : "Eigene Leitlinie: Lage, Höhen, Blickseite und vollständiger Dach-/Fassadenausschnitt sind ungeprüft."
        : args.mode === "object-cover"
        ? "Orthografische Ansichten nach innen. Der Streifen zeigt überlappende Ansichten eines Objekts, keine verzerrungsfreie Oberflächenabwicklung."
        : "Virtueller Aussichtspunkt. Nahes Mauerwerk darf sichtbar sein; Augenhöhe und Hindernisse sind nicht als realer Besucherstandort bestätigt."}
      {
        " Abdeckung ist noch nicht für jede Kamera belegt; fehlende Geometrie bedeutet nicht freie Sicht. "
      }
      {args.source === "terrain" &&
        "DGM zeigt nur Gelände: Gebäude, Fassaden und Vegetation fehlen absichtlich. "}
      {args.clipping &&
        "Clipping entfernt Vordergrundgeometrie; das Ergebnis ist eine Schnittansicht, kein unverdeckter realer Blick. "}
      {args.scenario === "facade" &&
        args.closed &&
        args.path !== "perimeter" &&
        args.spineMergeAngleDegrees > 0 &&
        "Review: Beim geschlossenen Ring kann der Startpunkt die zusammengefassten Segmente beeinflussen. "}
      {args.scenario === "facade" &&
        args.path === "wupper-bank" &&
        args.closed &&
        "Review: Der Ringschluss ist eine künstliche Verbindung, kein erfasstes Ufer. "}
    </aside>
  );
  const navigationHelp = (
    <p>
      {isLight
        ? "Sechs Ansichten vom gewählten Lichtpunkt: +X, −X, +Y, −Y, +Z, −Z. Kein analytisch zertifiziertes Viewshed."
        : "Bildnavigation: Ziehen zum Verschieben, Mausrad/Trackpad zum Zoomen, Pfeiltasten und +/−, 0 für Einpassen. Alt + vertikales Ziehen ändert die Höhe des gesamten Arrays. Geschlossene Ringe laufen nahtlos weiter; offene Streifen haben Enden. Die Übersichtskarte bewegt den Kameraverbund nicht. Sichtbare Segmente zeichnen gemeinsam direkt in die Karten-Canvas."}
      {args.scenario === "facade" &&
        " Leitlinie/Höhe sind editierbare Referenzen, kein vermessenes Fassadenmodell."}
      {args.elevation !== 0
        ? ` Editierte Szenenhöhe: ${args.elevation.toFixed(
            2
          )} m; keine vermessene Kameraposition.`
        : isLongCorridor
        ? " Höhenreferenz: ein gemeinsames Preset-Höhenfenster für die ganze Wand. Alt + vertikales Ziehen verschiebt alle Kameras gemeinsam; keine vermessene Gleis- oder Fassadenhöhe. © OpenStreetMap contributors (ODbL)."
        : ` Höhenreferenz: ${preset.elevationNote}`}
      {args.scenario === "facade" &&
        args.path === "wupper-bank" &&
        ` Nordufer der Wupper aus basemap.de-Gewässerflächen, keine versetzte Bahntrasse. Knicke über ${args.spineMergeAngleDegrees}° erhalten eigene Kamerasegmente. © 2026 basemap.de / BKG, GeoBasis-DE.`}
      {args.scenario === "facade" &&
        args.fitVertical &&
        !isLongCorridor &&
        args.path !== "custom" &&
        "verticalWindow" in preset &&
        ` Höhenfenster: ${preset.verticalWindow.minElevation.toFixed(
          1
        )}–${preset.verticalWindow.maxElevation.toFixed(1)} m plus ${
          args.verticalPadding
        } m Rand. ${preset.verticalWindow.note}`}
    </p>
  );
  return (
    <main
      className={`tile-stress${isLight ? "" : " tile-stress-camera"}`}
      data-test-id="tile-stress"
    >
      {isLight && (
        <header role="status" data-test-id="tile-stress-status">
          {status}
        </header>
      )}
      {isLight && reviewContent}
      {error && <p role="alert">{error}</p>}
      <div className="tile-stress-map-shell">
        <div
          ref={container}
          className="tile-stress-map"
          data-test-id="tile-stress-map"
          style={
            isNight
              ? { height: "calc(100vh - 170px)", minHeight: 550 }
              : undefined
          }
        />
        {world && (
          <TileLoadingDebug map={world.map} runtimeHandle={world.mesh} />
        )}
        {showStrip && !isLight && (
          <div
            ref={stripViewport}
            className="tile-stress-strip tile-stress-strip-embedded"
            style={showBothSides ? { bottom: "26%", height: "26%" } : undefined}
            aria-label="Unrolled camera images"
          />
        )}
        {showStrip && !isLight && showBothSides && (
          <div
            ref={oppositeViewport}
            className="tile-stress-strip tile-stress-strip-embedded"
            style={{ height: "26%" }}
            aria-label="Opposite street side · unfolded downward"
          />
        )}
      </div>
      {isNight && (
        <p>
          Drei Straßenfragmente, Schwebebahn und DB-Gleis aus © OpenStreetMap
          contributors (ODbL). 23-Uhr-Stimmung, kein Live-Verkehr oder Fahrplan.
          Autos: zwei Frontscheinwerfer, rote Rücklichter; Ampeln: Rot →
          Rot/Gelb → Grün → Gelb. Höhen aus DGM, Leuchtenmasthöhe angenommen{" "}
          {args.mastHeight} m; Schwebebahn-Trasse angenommen 13 m über Gelände.
          Brückenhöhen, Gleisüberhöhung und Verdeckungen: Review erforderlich.
          Nicht mit Geländehöhen belegte Routen bleiben deaktiviert. Fahrzeuge
          erscheinen und verschwinden an den Grenzen der Datenfragmente.
        </p>
      )}
      {showStrip && (
        <>
          <label>
            {isLight
              ? "Cube-Faces"
              : args.scenario === "facade"
              ? "Strecke"
              : "Blickrichtung"}
            {stripScrollable && (
              <input
                aria-label="Spine station"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={station}
                onChange={(event) => navigate(Number(event.target.value))}
              />
            )}
          </label>
          <div className="tile-stress-strip-tools">
            <button
              type="button"
              aria-label="Ansicht einpassen"
              title="Ansicht einpassen"
              onClick={() => stripPresentation.current?.resetView()}
            >
              ⛶
            </button>

            {!isLight && (
              <span>
                <button
                  type="button"
                  aria-label="Gesamtes Kamera-Array absenken"
                  title="1 m nach unten · Umschalt: 10 m"
                  onClick={(event) =>
                    setElevationOffset(
                      (value) => value - (event.shiftKey ? 10 : 1)
                    )
                  }
                >
                  ▼
                </button>{" "}
                <output title="Höhenversatz des gesamten Arrays">
                  {elevationOffset > 0 ? "+" : ""}
                  {elevationOffset.toFixed(1)} m
                </output>{" "}
                <button
                  type="button"
                  aria-label="Gesamtes Kamera-Array anheben"
                  title="1 m nach oben · Umschalt: 10 m"
                  onClick={(event) =>
                    setElevationOffset(
                      (value) => value + (event.shiftKey ? 10 : 1)
                    )
                  }
                >
                  ▲
                </button>{" "}
                <button
                  type="button"
                  title="Höhe zurücksetzen"
                  aria-label="Höhe zurücksetzen"
                  disabled={elevationOffset === 0}
                  onClick={() => setElevationOffset(0)}
                >
                  ↺
                </button>
              </span>
            )}
            {!isLight && (
              <details className="tile-stress-info">
                <summary
                  aria-label="Informationen zur Kameraansicht"
                  title="Bedienung, Daten und Diagnose"
                >
                  ⓘ
                </summary>
                <div className="tile-stress-info-content">
                  <h3>Kameraansicht</h3>
                  <header role="status" data-test-id="tile-stress-status">
                    {status}
                  </header>
                  <p>{segments} Kamerasegmente · ein gemeinsamer Tile-Pool</p>
                  {navigationHelp}
                  {args.pairedSides && (
                    <p>
                      {showBothSides
                        ? `Oben: ${
                            upperSide === 1 ? "links" : "rechts"
                          } · unten: Gegenseite nach unten aufgeklappt. Gleiche Station und Zoom; links/rechts relativ zur Leitlinie West → Ost.`
                        : `${
                            upperSide === 1 ? "Linke" : "Rechte"
                          } Straßenseite · Einzelansicht. Links/rechts relativ zur Leitlinie West → Ost.`}
                    </p>
                  )}
                  {args.scenario === "facade" && (
                    <p>
                      Referenzfläche: {args.referenceSurfaceOffset ?? 0} m ab
                      Leitlinie in Blickrichtung. Segmentkanten schließen dort
                      aneinander an. Vor und hinter dieser Fläche bleiben bei
                      Knicken orthografische Parallaxen möglich; die
                      Vordergrund-Schnittebene bleibt unabhängig.
                    </p>
                  )}

                  {reviewContent}
                </div>
              </details>
            )}
          </div>
          {isLight && (
            <div
              ref={stripViewport}
              className="tile-stress-strip"
              aria-label="Unrolled camera images"
            />
          )}
          <canvas ref={stripCanvas} hidden data-test-id="tile-stress-strip" />
          <div
            className="tile-stress-strip-labels"
            aria-label="Camera segments"
          >
            {stripLabels.map(({ label }, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          {isLight && navigationHelp}
        </>
      )}
      {isLight && !isNight && (
        <p>
          Live-Punktlichtschatten auf gemeinsam geladenem{" "}
          {args.source === "mesh" ? "2024-Mesh" : "DGM-Gelände (ohne Gebäude)"}.
          Schatten sind keine zertifizierte Sichtbarkeitsanalyse. Alle
          Lichtansichten fordern Geometrie aus demselben Pool an.
        </p>
      )}
    </main>
  );
}
