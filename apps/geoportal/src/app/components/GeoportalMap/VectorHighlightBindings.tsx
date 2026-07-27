import { useMemo } from "react";
import type { MutableRefObject } from "react";
import { useSelector } from "react-redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapHighlighting } from "@carma-mapping/engines/maplibre";

import { getLayers, getLayersIdle } from "../../store/slices/mapping";

/**
 * Binds `useMapHighlighting` to every visible Geoportal vector layer.
 *
 * BELIS has ONE MapLibre map, so it calls the hook once. Geoportal mounts one
 * MapLibre instance per vector layer (`maplibreMapsRef`, keyed by layer id), and
 * hooks can't be called in a loop — so we render one headless child per map,
 * each running its own hook instance. They all read the same
 * `MapHighlightContext`, so a single criteria set drives every layer.
 *
 * `modifierClick` is null on purpose: in Geoportal the MapLibre canvases are
 * non-interactive overlays inside Leaflet panes, so `map.on("click")` never
 * fires. The click signal comes from Leaflet via `useVectorHighlightToggle`.
 */

const HighlightBinding = ({ id, map }: { id: string; map: MaplibreMap }) => {
  useMapHighlighting({
    map,
    modifierClick: null,
    onHighlightsApplied: (features) =>
      console.log("xxx [highlight-bind] applied", id, features.length),
  });
  return null;
};

interface Entry {
  id: string;
  map: MaplibreMap;
}

const VectorHighlightBindings = ({
  maplibreMapsRef,
}: {
  maplibreMapsRef: MutableRefObject<Map<string, MaplibreMap>>;
}) => {
  const layers = useSelector(getLayers);
  // The ref isn't reactive; `layersIdle` flips once cismap has created the
  // instances, which is our cue to re-read it.
  const layersIdle = useSelector(getLayersIdle);

  const entries = useMemo<Entry[]>(
    () =>
      layers
        .filter((l) => l.layerType === "vector" && l.visible)
        .map((l) => ({ id: l.id, map: maplibreMapsRef.current.get(l.id) }))
        .filter((e): e is Entry => e.map !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, layersIdle, maplibreMapsRef]
  );

  console.log(
    "xxx [highlight-bind] bound maps",
    entries.map((e) => e.id),
    "of vector layers",
    layers.filter((l) => l.layerType === "vector" && l.visible).map((l) => l.id)
  );

  return (
    <>
      {entries.map((e) => (
        <HighlightBinding key={e.id} id={e.id} map={e.map} />
      ))}
    </>
  );
};

export default VectorHighlightBindings;
