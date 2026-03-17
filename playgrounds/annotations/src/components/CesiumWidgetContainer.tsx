import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  Cartesian2,
  Cartographic,
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  Matrix4,
  PerspectiveFrustum,
  type CesiumWidget,
  type Scene,
} from "@carma/cesium";
import {
  createMinimalCesiumWidget,
  sampleTerrainMostDetailedGuardedAsync,
} from "@carma-mapping/engines/cesium/api";
import { degToRadNumeric } from "@carma/units/helpers";
import type { SceneDescriptorHashSnapshot } from "@carma-providers/hash-state";
import {
  WUPPERTAL,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import { buildObjectCentricCameraOrientation } from "./objectCentricCesiumCamera";

type DefaultCameraState = {
  longitude: number;
  latitude: number;
  heightAboveTerrain: number;
  heading: number;
  pitch: number;
  roll: number;
};

const DEFAULT_CAMERA_HEIGHT_ABOVE_TERRAIN_M = 500;
const DEFAULT_INITIAL_CAMERA_STATE: DefaultCameraState = {
  longitude: degToRadNumeric(WUPPERTAL.position.longitude),
  latitude: degToRadNumeric(WUPPERTAL.position.latitude - 0.003),
  heightAboveTerrain: DEFAULT_CAMERA_HEIGHT_ABOVE_TERRAIN_M,
  heading: degToRadNumeric(0),
  pitch: degToRadNumeric(-45),
  roll: 0,
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const sampleTerrainHeightAtPosition = async (
  terrainProvider: CesiumTerrainProvider,
  longitude: number,
  latitude: number
): Promise<number> => {
  const [sampledCartographic] = await sampleTerrainMostDetailedGuardedAsync(
    terrainProvider,
    [Cartographic.fromRadians(longitude, latitude)],
    true,
    true
  );
  const sampledHeight = sampledCartographic?.height;
  if (!isFiniteNumber(sampledHeight)) {
    throw new Error(
      `[annotations-playground] Missing terrain height sample at lon=${longitude.toFixed(
        6
      )}rad lat=${latitude.toFixed(6)}rad`
    );
  }
  return sampledHeight;
};

const applyCameraState = async (
  widget: CesiumWidget,
  terrainProvider: CesiumTerrainProvider,
  state: DefaultCameraState
) => {
  const sampledTerrainHeight = await sampleTerrainHeightAtPosition(
    terrainProvider,
    state.longitude,
    state.latitude
  );
  widget.camera.setView({
    destination: Cartesian3.fromRadians(
      state.longitude,
      state.latitude,
      sampledTerrainHeight + state.heightAboveTerrain
    ),
    orientation: {
      heading: state.heading,
      pitch: state.pitch,
      roll: state.roll,
    },
  });
  widget.scene.requestRender();
};

const initializeWidget = (
  container: HTMLDivElement,
  useBrowserRecommendedResolution = false
): CesiumWidget => {
  const widget = createMinimalCesiumWidget(container, {
    requestRenderMode: true,
    useBrowserRecommendedResolution,
  });

  widget.scene.requestRenderMode = true;

  return widget;
};

const initializeTerrainProviders = async () => {
  const providers = {
    terrain: null as CesiumTerrainProvider | null,
    surface: null as CesiumTerrainProvider | null,
  };

  try {
    providers.terrain = await CesiumTerrainProvider.fromUrl(
      WUPP_TERRAIN_PROVIDER.url
    );
  } catch (error) {
    console.warn(
      "[annotations-playground] Failed to initialize terrain provider",
      {
        error,
        url: WUPP_TERRAIN_PROVIDER.url,
      }
    );
  }

  try {
    providers.surface = await CesiumTerrainProvider.fromUrl(
      WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url
    );
  } catch (error) {
    console.warn(
      "[annotations-playground] Failed to initialize surface provider",
      {
        error,
        url: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
      }
    );
  }

  return providers;
};

const applyInitialCameraState = async ({
  widget,
  terrainProvider,
  initialCameraState,
}: {
  widget: CesiumWidget;
  terrainProvider: CesiumTerrainProvider;
  initialCameraState: SceneDescriptorHashSnapshot | null;
}) => {
  if (initialCameraState) {
    const orientation = buildObjectCentricCameraOrientation(initialCameraState);
    if (orientation) {
      widget.camera.lookAtTransform(Matrix4.IDENTITY);
      widget.camera.setView({
        destination: orientation.destination,
        orientation: {
          direction: orientation.direction,
          up: orientation.up,
        },
      });

      if (
        isFiniteNumber(orientation.fovRad) &&
        widget.camera.frustum instanceof PerspectiveFrustum
      ) {
        widget.camera.frustum.fov = orientation.fovRad;
      }

      widget.scene.requestRender();
      return;
    }
  }

  await applyCameraState(widget, terrainProvider, DEFAULT_INITIAL_CAMERA_STATE);
};

const sampleScreenCenterTerrainIntersection = (scene: Scene) => {
  const { camera, canvas, globe } = scene;
  if (!camera || !canvas || typeof camera.getPickRay !== "function") {
    return null;
  }

  const ray = camera.getPickRay(
    new Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5)
  );
  if (!ray || typeof globe?.pick !== "function") {
    return null;
  }

  return globe.pick(ray, scene);
};

const assertScreenCenterTerrainIntersection = async (
  scene: Scene,
  maxAttempts = 45
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const hit = sampleScreenCenterTerrainIntersection(scene);
    if (hit) {
      return;
    }
    scene.requestRender();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 16);
    });
  }

  throw new Error(
    "[annotations-playground] Missing terrain intersection at screen center."
  );
};

const loadTileset = async (
  widget: CesiumWidget
): Promise<Cesium3DTileset | null> => {
  try {
    const tileset = await Cesium3DTileset.fromUrl(WUPP_MESH_2024.url, {
      preloadWhenHidden: false,
      scene: widget.scene,
      shadows: 0,
      enableCollision: false,
      maximumScreenSpaceError: 6,
      skipLevelOfDetail: true,
      skipScreenSpaceErrorFactor: 128,
      baseScreenSpaceError: 4096,
    });

    if (!widget.isDestroyed()) {
      widget.scene.primitives.add(tileset);
      widget.scene.requestRender();
    }

    return tileset;
  } catch (error) {
    console.warn("[annotations-playground] Failed to load tileset", {
      error,
      url: WUPP_MESH_2024.url,
    });
    return null;
  }
};

type CesiumWidgetContainerProps = {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  onSceneChange?: (scene: Scene | null) => void;
  initialCameraState?: SceneDescriptorHashSnapshot | null;
  startPoseResolved?: boolean;
  children: ReactNode;
};

export function CesiumWidgetContainer({
  rootRef,
  onSceneChange,
  initialCameraState = null,
  startPoseResolved = true,
  children,
}: CesiumWidgetContainerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);

  useEffect(() => {
    if (!startPoseResolved || !cesiumContainerRef.current) return;
    let disposed = false;

    const initialize = async () => {
      const widget = initializeWidget(cesiumContainerRef.current);
      if (disposed) {
        if (!widget.isDestroyed()) {
          widget.destroy();
        }
        return;
      }

      widgetRef.current = widget;
      const providersPromise = initializeTerrainProviders();
      const tilesetPromise = loadTileset(widget);

      const providers = await providersPromise;

      if (disposed || widget.isDestroyed()) return;

      if (!providers.terrain) {
        throw new Error(
          "[annotations-playground] Terrain provider is required for this demo."
        );
      }

      widget.scene.terrainProvider = providers.terrain;

      await applyInitialCameraState({
        widget,
        terrainProvider: providers.terrain,
        initialCameraState,
      });
      await assertScreenCenterTerrainIntersection(widget.scene);

      if (disposed || widget.isDestroyed()) return;

      onSceneChange?.(widget.scene);
      setIsWidgetReady(true);

      const tileset = await tilesetPromise;
      if (disposed || widget.isDestroyed()) return;

      terrainProviderRef.current = providers.terrain;
      surfaceProviderRef.current = providers.surface;
      tilesetRef.current = tileset;
      widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[annotations-playground] Failed to initialize CesiumWidget container",
        error
      );
      onSceneChange?.(null);
      setIsWidgetReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    });

    return () => {
      disposed = true;
      onSceneChange?.(null);
      setIsWidgetReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [initialCameraState, onSceneChange, startPoseResolved]);

  useEffect(() => {
    if (!isWidgetReady) {
      return;
    }
    widgetRef.current?.scene.requestRender();
  }, [isWidgetReady]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      {children}
    </div>
  );
}
