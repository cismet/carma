import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  Cartesian3,
  Cesium3DTileset,
  CesiumTerrainProvider,
  createMinimalCesiumWidget,
  type CesiumWidget,
  type ImageryLayer,
  type Scene,
} from "@carma/cesium";
import { degToRadNumeric } from "@carma/units/helpers";
import {
  WUPPERTAL,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

type PersistedCameraState = {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
};

const CAMERA_STATE_STORAGE_KEY = "annotations-playground-camera-state";
const CAMERA_SAVE_DELAY_MS = 750;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parsePersistedCameraState = (
  rawValue: string | null
): PersistedCameraState | null => {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedCameraState>;
    if (
      !isFiniteNumber(parsed.longitude) ||
      !isFiniteNumber(parsed.latitude) ||
      !isFiniteNumber(parsed.height) ||
      !isFiniteNumber(parsed.heading) ||
      !isFiniteNumber(parsed.pitch) ||
      !isFiniteNumber(parsed.roll)
    ) {
      return null;
    }

    return {
      longitude: parsed.longitude,
      latitude: parsed.latitude,
      height: parsed.height,
      heading: parsed.heading,
      pitch: parsed.pitch,
      roll: parsed.roll,
    };
  } catch {
    return null;
  }
};

const loadPersistedCameraState = (): PersistedCameraState | null =>
  parsePersistedCameraState(localStorage.getItem(CAMERA_STATE_STORAGE_KEY));

const savePersistedCameraState = (state: PersistedCameraState) => {
  try {
    localStorage.setItem(CAMERA_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn(
      "[annotations-playground] Failed to persist camera state",
      error
    );
  }
};

const extractCameraState = (widget: CesiumWidget): PersistedCameraState => {
  const camera = widget.camera;
  const position = camera.positionCartographic;
  return {
    longitude: position.longitude,
    latitude: position.latitude,
    height: position.height,
    heading: camera.heading,
    pitch: camera.pitch,
    roll: camera.roll,
  };
};

const applyCameraState = (
  widget: CesiumWidget,
  state: PersistedCameraState
) => {
  widget.camera.setView({
    destination: Cartesian3.fromRadians(
      state.longitude,
      state.latitude,
      state.height
    ),
    orientation: {
      heading: state.heading,
      pitch: state.pitch,
      roll: state.roll,
    },
  });
  widget.scene.requestRender();
};

const setupCameraPersistence = (widget: CesiumWidget): (() => void) => {
  const persistedState = loadPersistedCameraState();
  if (persistedState) {
    applyCameraState(widget, persistedState);
  }

  let saveTimeout: number | null = null;

  const onCameraChanged = () => {
    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }

    saveTimeout = window.setTimeout(() => {
      if (widget.isDestroyed()) return;
      savePersistedCameraState(extractCameraState(widget));
      saveTimeout = null;
    }, CAMERA_SAVE_DELAY_MS);
  };

  const removeListener =
    widget.camera.changed.addEventListener(onCameraChanged);

  return () => {
    removeListener?.();
    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }
  };
};

const requestRenderWithOptions = (
  scene: Scene | null,
  opts?: {
    delay?: number;
    repeat?: number;
    repeatInterval?: number;
  }
) => {
  if (!scene || scene.isDestroyed()) return;
  const delay = Math.max(0, opts?.delay ?? 0);
  const repeat = Math.max(1, opts?.repeat ?? 1);
  const repeatInterval = Math.max(0, opts?.repeatInterval ?? 50);

  const renderOnce = () => {
    if (!scene.isDestroyed()) {
      scene.requestRender();
    }
  };

  if (delay > 0) {
    window.setTimeout(renderOnce, delay);
  } else {
    renderOnce();
  }

  for (let index = 1; index < repeat; index += 1) {
    window.setTimeout(renderOnce, delay + repeatInterval * index);
  }
};

const initializeWidget = (
  container: HTMLDivElement,
  useBrowserRecommendedResolution = false
): CesiumWidget => {
  const widget = createMinimalCesiumWidget(container, {
    useBrowserRecommendedResolution,
  });
  const position = Cartesian3.fromDegrees(
    WUPPERTAL.position.longitude,
    WUPPERTAL.position.latitude - 0.003,
    500
  );
  widget.camera.setView({
    destination: position,
    orientation: {
      heading: degToRadNumeric(0),
      pitch: degToRadNumeric(-45),
      roll: 0,
    },
  });

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
  children: ReactNode;
};

export function CesiumWidgetContainer({
  rootRef,
  onSceneChange,
  children,
}: CesiumWidgetContainerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const terrainProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const surfaceProviderRef = useRef<CesiumTerrainProvider | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [providersReady, setProvidersReady] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [initialViewApplied, setInitialViewApplied] = useState(true);

  useEffect(() => {
    if (!cesiumContainerRef.current) return;
    let disposed = false;
    let teardownCameraPersistence: (() => void) | null = null;

    const initialize = async () => {
      const widget = initializeWidget(cesiumContainerRef.current);
      if (disposed) {
        if (!widget.isDestroyed()) {
          widget.destroy();
        }
        return;
      }

      widgetRef.current = widget;
      onSceneChange?.(widget.scene);
      teardownCameraPersistence = setupCameraPersistence(widget);
      setIsViewerReady(true);
      setInitialViewApplied(true);

      const [providers, tileset] = await Promise.all([
        initializeTerrainProviders(),
        loadTileset(widget),
      ]);

      if (disposed || widget.isDestroyed()) return;

      terrainProviderRef.current = providers.terrain;
      surfaceProviderRef.current = providers.surface;
      tilesetRef.current = tileset;
      setProvidersReady(true);
      widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[annotations-playground] Failed to initialize CesiumWidget container",
        error
      );
    });

    return () => {
      disposed = true;
      onSceneChange?.(null);
      teardownCameraPersistence?.();
      setProvidersReady(false);
      setIsViewerReady(false);
      terrainProviderRef.current = null;
      surfaceProviderRef.current = null;
      tilesetRef.current = null;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, [onSceneChange]);

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
