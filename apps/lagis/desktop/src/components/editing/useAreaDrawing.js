import { useRef, useState } from "react";
import { getColorFromCode } from "../../core/tools/helper";
import { planarArea, toUtm, toWgs84 } from "../../core/wizard/geometry";

const round2 = (number) => Math.round(number * 100) / 100;

// terra-draw rejects coordinates with more than 9 decimals
const roundCoords = (coords) =>
  typeof coords[0] === "number"
    ? coords.map((c) => Math.round(c * 1e9) / 1e9)
    : coords.map(roundCoords);

const toMeasurementFeatures = (rows) =>
  rows
    .filter((row) => row.geometry && row.measurementId)
    .map((row) => {
      const wgs84 = toWgs84(row.geometry);
      return {
        id: row.measurementId,
        type: "Feature",
        geometry: {
          type: wgs84.type,
          coordinates: roundCoords(wgs84.coordinates),
        },
        properties: { mode: "polygon" },
      };
    });

const withArea = (row, feature) => {
  const geometry = toUtm(feature.geometry);
  return {
    ...row,
    measurementId: String(feature.id),
    geometry,
    flaeche: round2(planarArea(geometry)),
  };
};

// with 2+ rows, a row counts 0 m² until its area is drawn
const withStartAreas = (rows, parcelArea) =>
  rows.map((row) => {
    if (row.geometry) {
      return row;
    }
    if (rows.length === 1) {
      return { ...row, flaeche: parcelArea ?? null };
    }
    return { ...row, flaeche: 0 };
  });

// Links Dienststellen rows to polygons drawn on an AreaMap: a new polygon
// goes to the active row, flaeche follows the drawn geometry.
const useAreaDrawing = ({
  rows,
  onChange,
  activeId,
  parcelArea,
  dienststellen,
}) => {
  const [drawMode, setDrawMode] = useState("none");
  const hostRef = useRef(null);
  // the host calls back synchronously while rows are still being updated
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const byId = new Map((dienststellen ?? []).map((d) => [d.id, d]));

  const commit = (nextRows) => {
    rowsRef.current = nextRows;
    onChange(nextRows);
  };

  const handleFeaturesChange = (features) => {
    const polygons = new Map(
      features
        // the host also reports on every click while a polygon is drawn
        .filter(
          (f) =>
            f.geometry?.type === "Polygon" && !f.properties?.currentlyDrawing
        )
        .map((f) => [String(f.id), f])
    );
    const current = rowsRef.current;
    const linked = new Set(current.map((row) => row.measurementId));
    const drawn = [...polygons.keys()].filter((id) => !linked.has(id));
    const newId = drawn[drawn.length - 1];
    const target = current.find((row) => row.id === activeIdRef.current);

    const replaced = [];
    const nextRows = current.map((row) => {
      if (newId && row === target) {
        if (row.measurementId && polygons.has(row.measurementId)) {
          replaced.push(row.measurementId);
        }
        return withArea(row, polygons.get(newId));
      }
      const feature = polygons.get(row.measurementId);
      if (feature) {
        return withArea(row, feature);
      }
      return row.measurementId
        ? { ...row, measurementId: undefined, geometry: undefined }
        : row;
    });
    commit(nextRows);

    const orphans = drawn.filter((id) => id !== newId || !target);
    [...replaced, ...orphans].forEach((id) =>
      hostRef.current?.deleteFeature(id)
    );
    if (newId) {
      setDrawMode("none");
    }
  };

  const handleRowsChange = (nextRows) => {
    const kept = new Set(nextRows.map((row) => row.id));
    const removed = rowsRef.current.filter(
      (row) => !kept.has(row.id) && row.measurementId
    );
    commit(
      nextRows.length === rowsRef.current.length
        ? nextRows
        : withStartAreas(nextRows, parcelArea)
    );
    removed.forEach((row) => hostRef.current?.deleteFeature(row.measurementId));
  };

  const areas = rows.map((row) => ({
    id: row.id,
    geometry: row.geometry,
    color:
      row.dienststelleId &&
      getColorFromCode(
        byId.get(row.dienststelleId)?.farbeArrayRelationShip?.[0]?.rgb_farbwert
      ),
  }));

  return {
    onRowsChange: handleRowsChange,
    mapProps: {
      ref: hostRef,
      areas,
      activeId,
      // read only when the map attaches, so it follows the rows
      initialFeatures: toMeasurementFeatures(rows),
      onFeaturesChange: handleFeaturesChange,
      drawMode,
      onDrawModeChange: setDrawMode,
    },
  };
};

export default useAreaDrawing;
