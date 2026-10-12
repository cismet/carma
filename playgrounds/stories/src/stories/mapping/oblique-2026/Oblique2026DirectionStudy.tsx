import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Degrees } from "@carma-units";
import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPP_LOD2_TILESET,
} from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import { ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  ObliqueViewer,
  ObliqueViewerActionsProvider,
  OBLIQUE_STATE_DEFAULT,
  acknowledgeObliqueRequest,
  formatImageLabel,
  requestObliqueCommand,
  useObliqueViewerActions,
  type ObliqueCommand,
  type ObliqueViewerActions,
  type ObliqueViewerState,
} from "@carma-mapping/oblique-viewer";

import {
  createWuppertalStoryStyle,
  WUPPERTAL_TERRAIN_SOURCE_ID,
} from "../maplibre/maplibre-story-style";
import "maplibre-gl/dist/maplibre-gl.css";

const SERIES_2026 = "wuppertal-2026";
const CONFIG_URI = "https://wupp-oblique.cismet.de/series-config-ecef-v2.json";
const PITCH_OVERRIDE: Degrees = 50 as Degrees;

export type Oblique2026DirectionStudyArgs = {
  preferredImageSeriesDirection: boolean;
  pitchOverrideEnabled: boolean;
  preferredImagePitchDeg: number;
  showAxisDebug: boolean;
  drapeImages: boolean;
  tileOrder: "scanline" | "center-out";
};

const SERIES_OVERRIDES = {
  [SERIES_2026]: {
    // Nadir metadata is a separate set; these photographs are unavailable.
    availableCameraViews: ["front", "right", "back", "left"],
    preferredAvifPyramidTemplate:
      "https://wupp-oblique.cismet.de/2026/image/{imageId}.avif",
  },
};

const samePatch = (
  state: ObliqueViewerState,
  patch: Partial<Omit<ObliqueViewerState, "request">>
) =>
  (Object.keys(patch) as (keyof typeof patch)[]).every((key) => {
    const next = patch[key];
    const previous = state[key];
    if (key === "enabledSeriesIds" || key === "series") {
      return JSON.stringify(previous) === JSON.stringify(next);
    }
    return previous === next;
  });

const VIEWER_CONFIG = {
  seriesConfigURI: CONFIG_URI,
  seriesOverrides: SERIES_OVERRIDES,
  nextInterface: true,
  prioritySeriesId: SERIES_2026,
  animations: { flyToExteriorOrientation: { duration: 700 } },
};

const useStoryActions = (args: Oblique2026DirectionStudyArgs) => {
  const [state, setState] = useState<ObliqueViewerState>(() => ({
    ...OBLIQUE_STATE_DEFAULT,
    enabledSeriesIds: [SERIES_2026],
    selectedSeriesId: SERIES_2026,
    isOn: true,
    previewSeamless: false,
    previewSeamlessMode: "mosaic",
    mapStyle3dEnabled: true,
    preferredImageSeriesDirection: args.preferredImageSeriesDirection,
    preferredImagePitchDeg: args.pitchOverrideEnabled
      ? (args.preferredImagePitchDeg as Degrees)
      : null,
    previewCenterDebug: args.showAxisDebug,
    previewBestImageDebug: args.showAxisDebug,
  }));

  const publish = useCallback(
    (patch: Partial<Omit<ObliqueViewerState, "request">>) =>
      setState((previous) =>
        samePatch(previous, patch) ? previous : { ...previous, ...patch }
      ),
    []
  );
  const setOn = useCallback((isOn: boolean) => publish({ isOn }), [publish]);
  const toggle = useCallback(() => {
    setState((previous) => ({ ...previous, isOn: !previous.isOn }));
  }, []);
  const setPanelOpen = useCallback(
    (panelOpen: boolean) => publish({ panelOpen }),
    [publish]
  );
  const setEnabledSeriesIds = useCallback(
    (_ids: string[]) => publish({ enabledSeriesIds: [SERIES_2026] }),
    [publish]
  );
  const sendRequest = useCallback((command: ObliqueCommand) => {
    setState((previous) => requestObliqueCommand(previous, command));
  }, []);
  const clearRequest = useCallback((seq: number) => {
    setState((previous) => acknowledgeObliqueRequest(previous, seq));
  }, []);
  const actions = useMemo<ObliqueViewerActions>(
    () => ({
      ...state,
      label: formatImageLabel(
        state.activeDirection,
        state.selectedSourceImageId
      ),
      publish,
      setOn,
      toggle,
      setPanelOpen,
      setEnabledSeriesIds,
      sendRequest,
      clearRequest,
    }),
    [
      state,
      publish,
      setOn,
      toggle,
      setPanelOpen,
      setEnabledSeriesIds,
      sendRequest,
      clearRequest,
    ]
  );

  useEffect(() => {
    publish({
      preferredImageSeriesDirection: args.preferredImageSeriesDirection,
      preferredImagePitchDeg: args.pitchOverrideEnabled
        ? (args.preferredImagePitchDeg as Degrees)
        : null,
      previewCenterDebug: args.showAxisDebug,
      previewBestImageDebug: args.showAxisDebug,
    });
  }, [
    args.preferredImageSeriesDirection,
    args.pitchOverrideEnabled,
    args.preferredImagePitchDeg,
    args.showAxisDebug,
    publish,
  ]);

  return { actions, state, publish };
};

const ReferenceReadout = ({ sceneStatus }: { sceneStatus: string }) => {
  const {
    label,
    referenceRayPitch,
    seriesDirectionHeadingDeg,
    seriesDirectionPitchDeg,
    preferredImageSeriesDirection,
    preferredImagePitchDeg,
    series,
    selectedSeriesId,
    selectedImageId,
    isLoading,
    isTargetImageLoading,
    error,
  } = useObliqueViewerActions();
  const selectedSeries = series.find((entry) => entry.id === selectedSeriesId);
  const originalPoint = referenceRayPitch?.referenceImagePoint;
  const preferredPoint = referenceRayPitch?.imagePoint;
  const originalUv = originalPoint
    ? `${originalPoint.x.toFixed(5)}, ${originalPoint.y.toFixed(5)}`
    : "wird geladen";
  const preferredUv = preferredPoint
    ? `${preferredPoint.x.toFixed(5)}, ${preferredPoint.y.toFixed(5)}`
    : "wird geladen";
  const mean =
    preferredImageSeriesDirection &&
    Number.isFinite(seriesDirectionHeadingDeg) &&
    Number.isFinite(seriesDirectionPitchDeg)
      ? `${seriesDirectionHeadingDeg!.toFixed(
          2
        )}° / ${seriesDirectionPitchDeg!.toFixed(2)}°`
      : "—";
  const modeLabel = preferredImageSeriesDirection
    ? "Serie + Himmelsrichtung"
    : "Fotoheading + Kameraneigung";
  const pitchSource =
    preferredImagePitchDeg !== null
      ? "Vorgabe"
      : preferredImageSeriesDirection
      ? "Serienmittel"
      : "Kamera";
  const status = referenceRayPitch
    ? `Referenz bereit für ${referenceRayPitch.imageId}`
    : error
    ? `Fehler: ${error}`
    : selectedImageId
    ? `Bild ${selectedImageId} gewählt; Referenz wird berechnet`
    : selectedSeries?.error
    ? `Serienfehler: ${selectedSeries.error}`
    : selectedSeries?.isLoading || isLoading
    ? `Katalog lädt (${selectedSeries?.imageCount ?? 0} Bilder)`
    : selectedSeries
    ? `Serie ${selectedSeries.id}: ${selectedSeries.imageCount} Bilder; noch keine Auswahl`
    : "Suche 2026-Serie";

  return (
    <div
      data-test-id="oblique-2026-reference-readout"
      aria-busy={isTargetImageLoading}
      style={{
        position: "absolute",
        zIndex: 5,
        left: 10,
        bottom: 10,
        maxWidth: "calc(100% - 20px)",
        padding: "5px 8px",
        background: "rgb(255 255 255 / 0.9)",
        font: "12px/1.4 system-ui, sans-serif",
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
      }}
    >
      {sceneStatus} ·{" "}
      {isTargetImageLoading
        ? "Fotoanfragen aktiv"
        : "Fotoanfragen abgeschlossen"}{" "}
      · {label || "Warte auf 2026-Katalog"} · {status} · {modeLabel} ·
      Original-UV {originalUv} · Ziel-UV {preferredUv} · Original-Pitch{" "}
      {referenceRayPitch?.centerPitchDeg.toFixed(2) ?? "—"}° · Ziel-Pitch{" "}
      {referenceRayPitch?.pitchDeg.toFixed(2) ?? "—"}° ({pitchSource}) ·
      Ziel-Heading {referenceRayPitch?.headingDeg?.toFixed(2) ?? "—"}° · Mittel
      H/P {mean}
    </div>
  );
};

/** Thin real-map host; the feature itself loads the production catalog and images. */
export const Oblique2026DirectionStudy = (
  args: Oblique2026DirectionStudyArgs
) => {
  const mapNode = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const { actions, state, publish } = useStoryActions(args);
  const viewerConfig = useMemo(
    () => ({
      ...VIEWER_CONFIG,
      mosaicPresentation: args.drapeImages
        ? ("surface" as const)
        : ("image-tiles" as const),
      mosaicTileOrder: args.tileOrder,
    }),
    [args.drapeImages, args.tileOrder]
  );
  const startedRef = useRef(false);
  const [sceneStatus, setSceneStatus] = useState(
    "LoD2 und Three-Gelände laden"
  );

  useEffect(() => {
    const container = mapNode.current;
    if (!container) return undefined;
    const instance = new maplibregl.Map({
      container,
      style: createWuppertalStoryStyle("stadtplan"),
      center: [7.2024356, 51.2772173],
      zoom: 18.098,
      bearing: 234.35,
      pitch: 45,
      maxPitch: 85,
      attributionControl: {},
    });
    const onLoad = () => {
      instance.setTerrain({ source: WUPPERTAL_TERRAIN_SOURCE_ID });
      setMap(instance);
    };
    instance.once("load", onLoad);
    return () => {
      instance.off("load", onLoad);
      setMap((current) => (current === instance ? null : current));
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (!map) return undefined;
    const lease = acquireSharedThreeScene(map, { mapStylePresentation: true });
    const origin = map.getCenter();
    let disposed = false;
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    const updateStatus = () => {
      if (disposed || statusTimer !== undefined) return;
      statusTimer = setTimeout(() => {
        statusTimer = undefined;
        if (disposed) return;
        const count = terrain.getPublishedTerrainTiles().length;
        const lod2Ready = lod2.scene.hasRenderableContent?.() === true;
        const label = `LoD2 ${
          lod2Ready ? "bereit" : "lädt"
        } · Three-Gelände ${count} Kacheln · FOV ${map
          .getVerticalFieldOfView()
          .toFixed(1)}°`;
        setSceneStatus((previous) => (previous === label ? previous : label));
      }, 250);
    };
    const terrain = buildRasterDemTerrainRuntime(
      "oblique-2026-story-terrain",
      NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      [origin.lng, origin.lat],
      {
        geometryProjection: "ecef",
        receivesMapStyleTexture: true,
        groundVisible: true,
        material: { unlit: true },
        errorTargetPixels: 4,
        motionErrorTargetPixels: 4,
        maximumMeshSegments: 128,
        requestConcurrency: 4,
        onContentChanged: (bounds) => {
          notifySharedThreeSceneContentChanged(map, { bounds });
          updateStatus();
        },
        onError: (error) => {
          if (!disposed) setSceneStatus(`Geländefehler: ${String(error)}`);
        },
      }
    );
    const lod2 = buildThreeTilesRuntime(
      "oblique-2026-story-lod2",
      WUPP_LOD2_TILESET.url,
      [origin.lng, origin.lat],
      {
        cameraLocalMount: true,
        providesTerrain: false,
        mapStyleDrape: "none",
        outline: false,
        requestConcurrency: 4,
        cacheBudgetBytes: 256 * 1024 ** 2,
        onContentChanged: (bounds, roots) => {
          notifySharedThreeSceneContentChanged(map, { bounds, roots });
          updateStatus();
        },
        onRequestStateChange: () =>
          notifySharedThreeSceneRequestStateChanged(map),
      }
    );
    lease.layer.addRuntime(terrain);
    lease.layer.addRuntime(lod2.scene);
    const unregisterTerrain = registerSharedThreeSceneRuntime(map, terrain);
    const unregisterLod2 = registerSharedThreeSceneRuntime(map, lod2.scene);
    map.on("moveend", updateStatus);
    updateStatus();
    return () => {
      disposed = true;
      clearTimeout(statusTimer);
      map.off("moveend", updateStatus);
      unregisterLod2();
      unregisterTerrain();
      lease.layer.removeRuntime(lod2.scene.id);
      lease.layer.removeRuntime(terrain.id);
      lease.release();
    };
  }, [map]);

  useEffect(() => {
    if (
      !map ||
      state.error ||
      state.selectedSeriesId !== SERIES_2026 ||
      !state.selectedImageId ||
      state.activeDirection === null ||
      startedRef.current
    ) {
      return;
    }
    startedRef.current = true;
    // Start when the 2026 catalog yields an image in the live direction; avoid
    // waiting for unrelated catalog sectors to finish loading.
    publish({ previewSeamless: true, previewSeamlessMode: "mosaic" });
  }, [
    map,
    state.error,
    state.selectedSeriesId,
    state.selectedImageId,
    state.activeDirection,
    publish,
  ]);

  return (
    <div
      data-test-id="oblique-2026-direction-study"
      style={{
        position: "relative",
        width: "100%",
        height: 680,
        minHeight: 480,
      }}
    >
      <div ref={mapNode} style={{ position: "absolute", inset: 0 }} />
      <ControlLayout>
        <ObliqueViewerActionsProvider actions={actions}>
          <ObliqueViewer config={viewerConfig} libreMap={map} />
          {map && <ReferenceReadout sceneStatus={sceneStatus} />}
        </ObliqueViewerActionsProvider>
      </ControlLayout>
    </div>
  );
};

export const OBLIQUE_2026_DEFAULTS: Oblique2026DirectionStudyArgs = {
  preferredImageSeriesDirection: false,
  pitchOverrideEnabled: false,
  preferredImagePitchDeg: PITCH_OVERRIDE,
  showAxisDebug: false,
  drapeImages: false,
  tileOrder: "scanline",
};
