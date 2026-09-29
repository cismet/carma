import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import maplibregl from "maplibre-gl";
import * as THREE from "three";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import {
  buildSharedThreeSceneLayer,
  buildThreeTilesRuntime,
  buildRasterDemTerrainRuntime,
} from "@carma-mapping/engines/maplibre";
import {
  REFERENCE_MESH_2024,
  TILE_STRESS_PRESETS,
} from "./tile-stress-presets";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";
import meshParityStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";
import {
  createWuppertalStoryStyle,
  WUPPERTAL_TERRAIN_SOURCE_ID,
} from "../maplibre/maplibre-story-style";

export const coverageLabel = (world: World) => {
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

export const useTileStressWorld = (
  args: TileCameraStressArgs,
  container: RefObject<HTMLDivElement>,
  controls: MutableRefObject<TileCameraStressArgs>,
  presetName: keyof typeof TILE_STRESS_PRESETS,
  isLight: boolean,
  isNight: boolean,
  isLongCorridor: boolean,
  setWorld: Dispatch<SetStateAction<World | null>>,
  setError: (error: string) => void
) => {
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
};
