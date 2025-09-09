import { Cartographic, Math as CesiumMath } from "cesium";
import type { CesiumContextType } from "../CesiumContext";

export type CesiumContextSnapshot = Readonly<
  Record<string, unknown> & {
    isViewerReady: boolean;
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
    const {
      viewerRef,
      terrainProviderRef,
      surfaceProviderRef,
      imageryLayerRef,
      tilesetsRefs,
      isViewerReady,
    } = cesium;

    const v = viewerRef.current;
    const cam = v?.camera;
    const scene = v?.scene;
    const carto = cam ? Cartographic.fromCartesian(cam.position) : undefined;
    const lon = carto ? CesiumMath.toDegrees(carto.longitude) : undefined;
    const lat = carto ? CesiumMath.toDegrees(carto.latitude) : undefined;
    const height = carto ? carto.height : undefined;

    return {
      isViewerReady,
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
        terrainProvider: terrainProviderRef.current?.constructor?.name,
        surfaceProvider: surfaceProviderRef.current?.constructor?.name,
        imageryLayer: imageryLayerRef.current ? "present" : "none",
      },
      tilesets: {
        primary: {
          ready: Boolean(
            (tilesetsRefs.primaryRef.current as unknown as { ready?: boolean })
              ?.ready
          ),
          url: (tilesetsRefs.primaryRef.current as unknown as { url?: string })
            ?.url,
        },
        secondary: {
          ready: Boolean(
            (
              tilesetsRefs.secondaryRef.current as unknown as {
                ready?: boolean;
              }
            )?.ready
          ),
          url: (
            tilesetsRefs.secondaryRef.current as unknown as { url?: string }
          )?.url,
        },
      },
    } as const;
  } catch {
    return {
      isViewerReady: false,
      viewerPresent: false,
      providers: { imageryLayer: "none" },
      tilesets: { primary: { ready: false }, secondary: { ready: false } },
      snapshotFailed: true,
    } as CesiumContextSnapshot;
  }
}
