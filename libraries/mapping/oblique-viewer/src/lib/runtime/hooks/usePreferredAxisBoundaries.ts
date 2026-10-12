import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Vector3 } from "three";
import {
  acquireSharedThreeScene,
  type MapStyleAxisBoundarySite,
} from "@carma-mapping/engines/maplibre";
import type { Degrees } from "@carma-units";
import type {
  ObliqueGroundTarget,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type {
  PhotoAxisPicker,
  PreparedBestImageField,
} from "../utils/photo-axis-picker";

export type PreferredAxisBoundarySource = MapStyleAxisBoundarySite;

type Options = {
  map: MaplibreMap | null;
  enabled: boolean;
  groupKey: string;
  catalogRevision: unknown;
  recordsRevision: unknown;
  readRecords: () => readonly ObliqueImageRecord[];
  preferredPitchDeg: Degrees | null;
  seriesDirection?: boolean;
  selectionData?: ObliqueSelectionData | null;
  bestImagePicker?: PhotoAxisPicker;
  /** Classic's bounded viewport window; NG keeps its complete group. */
  localField?: boolean;
  /** Cached pointer hit or cheap centre reference; never trace during rendering. */
  readFocusTarget?: () => ObliqueGroundTarget | null;
};

let nextId = 0;
const AXIS_SOURCE_REBUILD_DEBOUNCE_MS = 100;

// Catalog chunks update these small per-series totals in place. Watching only
// the Map identity would leave the standalone debug overlay on an older axis.
const referenceTotalsKey = (options: Options) =>
  options.seriesDirection
    ? JSON.stringify(
        [
          ...(options.selectionData?.obliqueReferenceByDirectionBySeries ?? []),
        ].map(([series, directions]) => [
          series,
          [...directions].map(([direction, totals]) => [
            direction,
            totals.opticalPitchSumRad,
            totals.headingSinSum,
            totals.headingCosSum,
            totals.imageCount,
          ]),
        ])
      )
    : "";

/** Display the picker's shared calibrated field; no independent camera resolver. */
export const usePreferredAxisBoundaries = (options: Options) => {
  const current = useRef(options);
  current.current = options;

  useEffect(() => {
    const map = options.map;
    const picker = options.bestImagePicker;
    if (!options.enabled || !map || !picker) return;
    const scene = acquireSharedThreeScene(map);
    const layer = scene.layer;
    const id = `oblique-preferred-axis-boundaries-${++nextId}`;
    let disposed = false;
    let generation = 0;
    let groupKey: string | undefined;
    let catalogRevision: unknown;
    let recordsRevision: unknown;
    let preferredPitch: Degrees | null | undefined;
    let seriesDirection: boolean | undefined;
    let localField: boolean | undefined;
    let selectionData: ObliqueSelectionData | null | undefined;
    let referenceTotals = "";
    let records: readonly ObliqueImageRecord[] | undefined;
    let pitchDeg: Degrees | undefined;
    let frameReady = false;
    let preparing = false;
    let prepared: PreparedBestImageField | undefined;
    let publishedRevision = "";
    let referenceToMetric: Matrix4 | null = null;
    const currentToReference = new Matrix4();
    let focusInMetric: Vector3 | null = null;
    let referenceKey = "";
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const cancel = () => {
      generation++;
      preparing = false;
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    };
    const clear = () => layer.setMapStyleAxisBoundaries?.(id, null);
    const publish = () => {
      if (!prepared || !referenceToMetric) return;
      const field = prepared.cache.readField();
      const revision = `${field.geometryRevision}:${field.axisRevision}`;
      if (revision === publishedRevision) return;
      publishedRevision = revision;
      layer.setMapStyleAxisBoundaries?.(
        id,
        field.sites.length
          ? {
              // GPU indices refer to the complete shared table, including other
              // heading groups. Eligibility is a separate per-consumer filter.
              sources: field.sites,
              candidateCache: prepared.cache,
              eligibleIds: prepared.eligibleIds,
              referenceToMetric: referenceToMetric.clone(),
              readFocus: () => focusInMetric?.clone() ?? null,
            }
          : null
      );
      map.triggerRepaint();
    };
    const prepare = async (
      nextRecords: readonly ObliqueImageRecord[],
      nextPitch: Degrees | undefined,
      request: number
    ) => {
      const frameAtStart = currentToReference.clone();
      const isCurrent = () =>
        !disposed &&
        generation === request &&
        frameAtStart.equals(currentToReference);
      preparing = true;
      try {
        const field = await picker.prepareBestField(nextRecords, {
          preferredPitchDeg: nextPitch,
          isCurrent,
          localField: current.current.localField,
        });
        if (!field || !isCurrent()) return;
        prepared = field;
        referenceToMetric = field.referenceToMetric
          .clone()
          .multiply(frameAtStart.clone().invert());
        publishedRevision = "";
        publish();
      } catch {
        // Debug preparation must not leave an unhandled rejection or display
        // stale geometry after the shared owner rejects a catalog generation.
        if (isCurrent()) {
          prepared = undefined;
          referenceToMetric = null;
          publishedRevision = "";
          clear();
        }
      } finally {
        if (generation === request) preparing = false;
      }
    };
    const refresh = () => {
      if (disposed || !frameReady) return;
      const nextRecords = current.current.readRecords();
      const nextReferenceTotals = referenceTotalsKey(current.current);
      const nextPitch = current.current.seriesDirection
        ? current.current.preferredPitchDeg ?? undefined
        : ((current.current.preferredPitchDeg ?? map.getPitch()) as Degrees);
      const changed =
        records === undefined ||
        catalogRevision !== current.current.catalogRevision ||
        recordsRevision !== current.current.recordsRevision ||
        groupKey !== current.current.groupKey ||
        preferredPitch !== current.current.preferredPitchDeg ||
        seriesDirection !== current.current.seriesDirection ||
        localField !== current.current.localField ||
        selectionData !== current.current.selectionData ||
        referenceTotals !== nextReferenceTotals ||
        records !== nextRecords ||
        pitchDeg !== nextPitch;
      if (!changed) return;
      catalogRevision = current.current.catalogRevision;
      recordsRevision = current.current.recordsRevision;
      groupKey = current.current.groupKey;
      preferredPitch = current.current.preferredPitchDeg;
      seriesDirection = current.current.seriesDirection;
      localField = current.current.localField;
      selectionData = current.current.selectionData;
      referenceTotals = nextReferenceTotals;
      records = nextRecords;
      pitchDeg = nextPitch;
      cancel();
      prepared = undefined;
      referenceToMetric = null;
      publishedRevision = "";
      clear();
      const request = generation;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void prepare(nextRecords, nextPitch, request);
      }, AXIS_SOURCE_REBUILD_DEBOUNCE_MS);
    };
    const onMoveEnd = () => {
      refresh();
      map.triggerRepaint();
    };
    map.on("moveend", onMoveEnd);
    const removeFrame = layer.addBeforeRenderCallback?.((frame) => {
      const localFrame = frame.localFrame;
      const nextReferenceKey = [
        ...localFrame.referenceLngLat,
        ...localFrame.sceneFromLocalReference.elements,
      ].join(",");
      const changedReference = referenceKey !== nextReferenceKey;
      const nextCurrentToReference =
        localFrame.currentToReference ?? new Matrix4();
      const changedFrame = !currentToReference.equals(nextCurrentToReference);
      currentToReference.copy(nextCurrentToReference);
      frameReady = true;
      referenceKey = nextReferenceKey;
      if (
        changedReference ||
        (changedFrame && (preparing || refreshTimer !== undefined))
      ) {
        cancel();
        records = undefined;
      }
      if (
        records === undefined ||
        catalogRevision !== current.current.catalogRevision ||
        recordsRevision !== current.current.recordsRevision ||
        groupKey !== current.current.groupKey ||
        preferredPitch !== current.current.preferredPitchDeg ||
        seriesDirection !== current.current.seriesDirection ||
        localField !== current.current.localField ||
        selectionData !== current.current.selectionData ||
        referenceTotals !== referenceTotalsKey(current.current)
      )
        refresh();
      const target = current.current.readFocusTarget?.();
      const point =
        target &&
        layer.projectLngLatToScene?.(
          [target.longitude, target.latitude],
          target.heightMeters ?? 0
        );
      focusInMetric =
        point && referenceToMetric
          ? point
              .clone()
              .applyMatrix4(currentToReference)
              .applyMatrix4(referenceToMetric)
          : null;
      if (focusInMetric && !focusInMetric.toArray().every(Number.isFinite))
        focusInMetric = null;
      publish();
    });
    map.triggerRepaint();
    return () => {
      disposed = true;
      cancel();
      removeFrame?.();
      map.off("moveend", onMoveEnd);
      clear();
      map.triggerRepaint();
      scene.release();
    };
  }, [options.enabled, options.map, options.bestImagePicker]);
};
