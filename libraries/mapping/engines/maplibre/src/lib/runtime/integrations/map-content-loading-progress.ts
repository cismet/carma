import type { Map as MaplibreMap, MapSourceDataEvent } from "maplibre-gl";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { MAP_LOADING_PHASE } from "../../core/map-loading-progress";
import { publishMapLoadingProgress } from "./map-loading-progress";

/** Source readiness, not fictional download bytes; IDLE includes placement/fades. */
export const trackMapContentLoadingProgress = (map: MaplibreMap) => {
  const sources = new Map<string, boolean>();
  let loading = false;
  const publish = (recordDuration = true) =>
    publishMapLoadingProgress(
      map,
      MAP_LOADING_PHASE.CONTENT,
      MAP_LOADING_PHASE.CONTENT,
      loading
        ? [...sources.values()].filter(Boolean).length / (sources.size + 1)
        : 1,
      recordDuration
    );
  const begin = () => {
    if (!loading) sources.clear();
    loading = true;
    publish();
  };
  const finish = (recordDuration = true) => {
    loading = false;
    sources.clear();
    publish(recordDuration);
  };
  const onIdle = () => finish();
  const onSourceLoading = (event: MapSourceDataEvent) => {
    begin();
    if (event.sourceId) sources.set(event.sourceId, false);
    publish();
  };
  const onSourceData = (event: MapSourceDataEvent) => {
    if (!loading) return;
    if (event.isSourceLoaded && sources.has(event.sourceId))
      sources.set(event.sourceId, true);
    publish();
  };
  const onError = () => {
    // An errored source is complete from a loading perspective. The existing
    // error UI remains responsible for reporting failure, rather than a stuck bar.
    for (const id of sources.keys()) {
      if (!map.getSource(id) || map.isSourceLoaded(id)) sources.set(id, true);
    }
    if (!map.isStyleLoaded() || map.loaded()) finish(false);
    else publish();
  };
  map.on(MAPLIBRE_EVENT.STYLE_DATA_LOADING, begin);
  map.on(MAPLIBRE_EVENT.SOURCE_DATA_LOADING, onSourceLoading);
  map.on(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
  map.on(MAPLIBRE_EVENT.SOURCE_DATA_ABORT, onSourceData);
  map.on(MAPLIBRE_EVENT.IDLE, onIdle);
  map.on(MAPLIBRE_EVENT.ERROR, onError);
  if (!map.loaded()) begin();
  return () => {
    map.off(MAPLIBRE_EVENT.STYLE_DATA_LOADING, begin);
    map.off(MAPLIBRE_EVENT.SOURCE_DATA_LOADING, onSourceLoading);
    map.off(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
    map.off(MAPLIBRE_EVENT.SOURCE_DATA_ABORT, onSourceData);
    map.off(MAPLIBRE_EVENT.IDLE, onIdle);
    map.off(MAPLIBRE_EVENT.ERROR, onError);
    finish(false);
  };
};
