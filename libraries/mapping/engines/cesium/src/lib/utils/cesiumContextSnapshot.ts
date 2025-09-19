import { Cartographic, Math as CesiumMath, type Viewer } from "cesium";
import type { CesiumContextType } from "../CesiumContext";

export type CesiumContextSnapshot = Readonly<
  Record<string, unknown> & {
    isReady: boolean;
    viewerPresent: boolean;
    snapshotFailed?: boolean;
    sceneMode?: unknown;
    morphTime?: unknown;
    camera?: {
      lon?: number;
      lat?: number;
      height?: number;
      heading?: number;
      pitch?: number;
      roll?: number;
    };
    providers: {
      terrainProvider?: string;
      surfaceProvider?: string;
      imageryLayer: "present" | "none";
    };
    tilesets: {
      primary: { ready: boolean; url?: string };
      secondary: { ready: boolean; url?: string };
    };
  }
>;

export function snapshotCesiumContext(
  cesium: CesiumContextType
): CesiumContextSnapshot {
  try {
    const { isReady } = cesium;

    let v: Viewer | undefined;
    cesium.withWidget((w) => {
      v = w;
    });
    if (!v) {
      return {
        isReady,
        viewerPresent: false,
        providers: { imageryLayer: "none" },
        tilesets: { primary: { ready: false }, secondary: { ready: false } },
        snapshotFailed: true,
      } as CesiumContextSnapshot;
    }

    // If the viewer has been destroyed, avoid accessing any of its properties,
    // as Cesium will throw DeveloperError("This object was destroyed").
    if (v.isDestroyed && v.isDestroyed()) {
      return {
        isReady,
        viewerPresent: false,
        providers: { imageryLayer: "none" },
        tilesets: { primary: { ready: false }, secondary: { ready: false } },
        snapshotFailed: true,
      } as CesiumContextSnapshot;
    }

    const cam = v?.camera;
    const scene = v?.scene;
    const carto = cam ? Cartographic.fromCartesian(cam.position) : undefined;
    const lon = carto ? CesiumMath.toDegrees(carto.longitude) : undefined;
    const lat = carto ? CesiumMath.toDegrees(carto.latitude) : undefined;
    const height = carto ? carto.height : undefined;

    let terrainProvider;
    let surfaceProvider;
    let imageryLayer;
    let tilesetPrimary;
    let tilesetSecondary;

    cesium.withTerrainProvider((provider) => {
      terrainProvider = provider;
    });
    cesium.withSurfaceProvider((provider) => {
      surfaceProvider = provider;
    });
    cesium.withImageryLayer((layer) => {
      imageryLayer = layer;
    });
    cesium.withPrimaryTileset((tileset) => {
      tilesetPrimary = tileset;
    });
    cesium.withSecondaryTileset((tileset) => {
      tilesetSecondary = tileset;
    });

    return {
      isReady,
      viewerPresent: Boolean(v && !v.isDestroyed()),
      sceneMode: scene?.mode,
      morphTime: scene?.morphTime,
      camera:
        cam &&
        ({
          lon,
          lat,
          height,
          heading:
            cam.heading != null ? CesiumMath.toDegrees(cam.heading) : undefined,
          pitch:
            cam.pitch != null ? CesiumMath.toDegrees(cam.pitch) : undefined,
          roll: cam.roll != null ? CesiumMath.toDegrees(cam.roll) : undefined,
        } as const),
      providers: {
        terrainProvider: terrainProvider?.constructor?.name,
        surfaceProvider: surfaceProvider?.constructor?.name,
        imageryLayer: imageryLayer ? "present" : "none",
      },
      tilesets: {
        primary: {
          ready: Boolean(tilesetPrimary?.ready),
          url: tilesetPrimary?.url,
        },
        secondary: {
          ready: Boolean(tilesetSecondary?.ready),
          url: tilesetSecondary?.url,
        },
      },
    } as const;
  } catch {
    return {
      isReady: false,
      viewerPresent: false,
      providers: { imageryLayer: "none" },
      tilesets: { primary: { ready: false }, secondary: { ready: false } },
      snapshotFailed: true,
    } as CesiumContextSnapshot;
  }
}
