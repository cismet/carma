import { useRef, useState } from "react";
import { message } from "antd";
import { addMeasurements } from "@carma-mapping/measurements";
import { getColorFromCode } from "../../core/tools/helper";
import { planarArea, toUtm, toWgs84 } from "../../core/wizard/geometry";
import { splitPolygon } from "../../core/editing/splitPolygon";
import { dienststelleLabel } from "./cells";

// Java-like tools: copy the parcel, split, edit vertices, assign pieces to
// Dienststellen. Unassigned pieces live next to the rows (`pieces`), so they
// stay in the draft and go away with it.
export const AREA_TOOL = {
  SELECT: "select",
  POLYGON: "polygon",
  SPLIT: "split",
  ASSIGN: "assign",
};

const DRAW_MODE = {
  [AREA_TOOL.SELECT]: "select",
  [AREA_TOOL.POLYGON]: "polygon",
  [AREA_TOOL.SPLIT]: "line",
  [AREA_TOOL.ASSIGN]: "select",
};

const round2 = (number) => Math.round(number * 100) / 100;

// terra-draw rejects coordinates with more than 9 decimals
const roundCoords = (coords) =>
  typeof coords[0] === "number"
    ? coords.map((c) => Math.round(c * 1e9) / 1e9)
    : coords.map(roundCoords);

// terra-draw edits single polygons only; multi-part areas stay display-only
const editablePolygon = (geometry) => {
  if (geometry?.type === "Polygon") {
    return geometry;
  }
  if (geometry?.type === "MultiPolygon" && geometry.coordinates.length === 1) {
    return {
      ...geometry,
      type: "Polygon",
      coordinates: geometry.coordinates[0],
    };
  }
  return null;
};

const polygonParts = (geometry) => {
  if (geometry?.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  return [];
};

const utmPolygon = (coordinates, crs) => ({
  type: "Polygon",
  coordinates,
  ...(crs ? { crs } : {}),
});

const wgs84Coords = (utmGeometry) =>
  roundCoords(toWgs84(editablePolygon(utmGeometry)).coordinates);

const toFeature = (id, utmGeometry) => ({
  id,
  type: "Feature",
  geometry: { type: "Polygon", coordinates: wgs84Coords(utmGeometry) },
  properties: { mode: "polygon" },
});

const sameShape = (feature, utmGeometry) =>
  JSON.stringify(feature.geometry.coordinates) ===
  JSON.stringify(wgs84Coords(utmGeometry));

const fromFeature = (feature) => toUtm(feature.geometry);

const withArea = (row, id, geometry) => ({
  ...row,
  measurementId: id,
  geometry,
  flaeche: round2(planarArea(geometry)),
});

const withoutArea = (row, rowCount) => ({
  ...row,
  measurementId: undefined,
  geometry: undefined,
  flaeche: rowCount === 1 ? row.flaeche : 0,
});

// with 2+ rows, a row counts 0 m² until its area is assigned
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

const newId = () => crypto.randomUUID();

const useAreaDrawing = ({
  rows,
  pieces: piecesIn,
  onChange,
  activeId,
  onActiveChange,
  parcelGeometry,
  parcelArea,
  dienststellen,
}) => {
  const pieces = piecesIn ?? [];
  const [tool, setTool] = useState(AREA_TOOL.SELECT);
  const [snapping, setSnapping] = useState(true);
  // edge-midpoint handles only on demand, long ALKIS borders get too busy
  const [insertPoints, setInsertPoints] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const hostRef = useRef(null);
  // the host calls back synchronously while the draft is still being updated
  const valueRef = useRef({ rows, pieces });
  valueRef.current = { rows, pieces };
  const toolRef = useRef(tool);
  toolRef.current = tool;
  // set while we change the map ourselves, so the echo is ignored
  const busyRef = useRef(false);
  // map ids for loaded areas; only written to a row once it changes, so
  // opening the map alone doesn't count as an edit
  const adoptedIds = useRef(new Map());
  const byId = new Map((dienststellen ?? []).map((d) => [d.id, d]));

  const idOf = (row) => {
    if (row.measurementId) {
      return row.measurementId;
    }
    if (!editablePolygon(row.geometry)) {
      return undefined;
    }
    if (!adoptedIds.current.has(row.id)) {
      adoptedIds.current.set(row.id, newId());
    }
    return adoptedIds.current.get(row.id);
  };

  const commit = (changes) => {
    valueRef.current = { ...valueRef.current, ...changes };
    // no pieces left = key unset, so the draft compares equal to the original
    onChange(
      changes.pieces?.length === 0 ? { ...changes, pieces: undefined } : changes
    );
  };

  const quietly = (fn) => {
    busyRef.current = true;
    try {
      fn();
    } finally {
      busyRef.current = false;
    }
  };

  const removeFromMap = (ids) =>
    quietly(() => ids.forEach((id) => hostRef.current?.deleteFeature(id)));

  const addToMap = (newPieces) =>
    quietly(() =>
      addMeasurements(newPieces.map((p) => toFeature(p.id, p.geometry)))
    );

  const reconcile = (polygons) => {
    const current = valueRef.current;
    let changed = false;
    const known = new Set();
    const nextRows = current.rows.map((row) => {
      const id = idOf(row);
      if (!id) {
        return row;
      }
      known.add(id);
      const feature = polygons.get(id);
      if (!feature) {
        changed = true;
        return withoutArea(row, current.rows.length);
      }
      if (sameShape(feature, row.geometry)) {
        return row;
      }
      changed = true;
      return withArea(row, id, fromFeature(feature));
    });
    const nextPieces = current.pieces.flatMap((piece) => {
      known.add(piece.id);
      const feature = polygons.get(piece.id);
      if (!feature) {
        changed = true;
        return [];
      }
      if (sameShape(feature, piece.geometry)) {
        return [piece];
      }
      changed = true;
      return [{ ...piece, geometry: fromFeature(feature) }];
    });
    // a new hand-drawn polygon starts as a free piece, like in Java
    polygons.forEach((feature, id) => {
      if (!known.has(id)) {
        changed = true;
        nextPieces.push({ id, geometry: fromFeature(feature) });
      }
    });
    if (changed) {
      commit({ dienststellen: nextRows, pieces: nextPieces });
    }
  };

  const split = (line) => {
    const cut = toUtm(line.geometry).coordinates;
    const { rows: currentRows, pieces: currentPieces } = valueRef.current;
    const created = [];
    const replaced = [];
    const splitOne = (id, geometry) => {
      const parts = splitPolygon(editablePolygon(geometry).coordinates, cut);
      if (!parts) {
        return false;
      }
      replaced.push(id);
      parts.forEach((coordinates) =>
        created.push({
          id: newId(),
          geometry: utmPolygon(coordinates, geometry.crs),
        })
      );
      return true;
    };
    const nextRows = currentRows.map((row) => {
      const id = idOf(row);
      return id && splitOne(id, row.geometry)
        ? withoutArea(row, currentRows.length)
        : row;
    });
    const nextPieces = currentPieces.filter(
      (piece) => !splitOne(piece.id, piece.geometry)
    );
    if (created.length === 0) {
      message.info(
        "Die Linie muss eine Fläche vollständig durchqueren (von Rand zu Rand)."
      );
      return;
    }
    removeFromMap(replaced);
    addToMap(created);
    commit({ dienststellen: nextRows, pieces: [...nextPieces, ...created] });
    // Java switches to "Polygon zuordnen" right after a split
    setTool(AREA_TOOL.ASSIGN);
  };

  const handleFeaturesChange = (features) => {
    if (busyRef.current) {
      return;
    }
    // the host also reports on every click while a geometry is drawn
    const finished = features.filter((f) => !f.properties?.currentlyDrawing);
    const lines = finished.filter((f) => f.geometry?.type === "LineString");
    if (lines.length > 0) {
      removeFromMap(lines.map((f) => String(f.id)));
      if (toolRef.current === AREA_TOOL.SPLIT) {
        lines.forEach(split);
      }
      return;
    }
    reconcile(
      new Map(
        finished
          .filter((f) => f.geometry?.type === "Polygon")
          .map((f) => [String(f.id), f])
      )
    );
  };

  const rowOfFeature = (id) =>
    valueRef.current.rows.find((row) => idOf(row) === id);

  const handleSelectionChange = (id) => {
    setSelectedId(id);
    if (!id) {
      return;
    }
    const row = rowOfFeature(id);
    if (row) {
      onActiveChange?.(row.id);
    }
    if (toolRef.current !== AREA_TOOL.ASSIGN) {
      return;
    }
    if (row) {
      message.info("Diese Fläche ist bereits einer Dienststelle zugeordnet.");
    } else if (valueRef.current.pieces.some((piece) => piece.id === id)) {
      setAssignId(id);
    }
  };

  // without this a second click on the same piece would not select it again
  const closeAssign = () => {
    setAssignId(null);
    setSelectedId(null);
    hostRef.current?.deselectAll();
  };

  const assign = (rowId) => {
    const { rows: currentRows, pieces: currentPieces } = valueRef.current;
    const piece = currentPieces.find((p) => p.id === assignId);
    closeAssign();
    if (!piece) {
      return;
    }
    commit({
      dienststellen: currentRows.map((row) =>
        row.id === rowId ? withArea(row, piece.id, piece.geometry) : row
      ),
      pieces: currentPieces.filter((p) => p.id !== piece.id),
    });
    onActiveChange?.(rowId);
  };

  const takeParcel = () => {
    const parts = polygonParts(parcelGeometry);
    if (parts.length === 0) {
      message.warning("Für dieses Flurstück ist keine Geometrie vorhanden.");
      return;
    }
    const created = parts.map((coordinates) => ({
      id: newId(),
      geometry: utmPolygon(coordinates, parcelGeometry.crs),
    }));
    addToMap(created);
    commit({ pieces: [...valueRef.current.pieces, ...created] });
    setTool(AREA_TOOL.SELECT);
  };

  // the area goes back to the free pieces, the map keeps the same polygon
  const unassignSelected = () => {
    const row = rowOfFeature(selectedId);
    if (!row) {
      return;
    }
    const { rows: currentRows, pieces: currentPieces } = valueRef.current;
    commit({
      dienststellen: currentRows.map((r) =>
        r === row ? withoutArea(r, currentRows.length) : r
      ),
      pieces: [
        ...currentPieces,
        { id: selectedId, geometry: editablePolygon(row.geometry) },
      ],
    });
  };

  const deleteSelected = () => {
    if (!selectedId) {
      return;
    }
    const { rows: currentRows, pieces: currentPieces } = valueRef.current;
    const id = selectedId;
    removeFromMap([id]);
    setSelectedId(null);
    commit({
      dienststellen: currentRows.map((row) =>
        idOf(row) === id ? withoutArea(row, currentRows.length) : row
      ),
      pieces: currentPieces.filter((piece) => piece.id !== id),
    });
  };

  const handleRowsChange = (nextRows) => {
    const kept = new Set(nextRows.map((row) => row.id));
    const removed = valueRef.current.rows
      .filter((row) => !kept.has(row.id))
      .map(idOf)
      .filter(Boolean);
    commit({
      dienststellen:
        nextRows.length === valueRef.current.rows.length
          ? nextRows
          : withStartAreas(nextRows, parcelArea),
    });
    removeFromMap(removed);
  };

  const areas = rows.map((row) => ({
    id: row.id,
    geometry: row.geometry,
    flaeche: row.flaeche,
    color:
      row.dienststelleId &&
      getColorFromCode(
        byId.get(row.dienststelleId)?.farbeArrayRelationShip?.[0]?.rgb_farbwert
      ),
  }));

  const rowLabel = (row, index) =>
    dienststelleLabel(byId.get(row.dienststelleId)) ||
    `Zeile ${index + 1} (ohne Dienststelle)`;

  const assignPiece = pieces.find((p) => p.id === assignId);
  const selectedIsRow = Boolean(selectedId && rowOfFeature(selectedId));

  return {
    onRowsChange: handleRowsChange,
    mapProps: {
      ref: hostRef,
      areas,
      pieces,
      activeId,
      initialFeatures: [
        ...rows
          .filter((row) => idOf(row))
          .map((row) => toFeature(idOf(row), row.geometry)),
        ...pieces.map((piece) => toFeature(piece.id, piece.geometry)),
      ],
      onFeaturesChange: handleFeaturesChange,
      onSelectionChange: handleSelectionChange,
      drawMode: DRAW_MODE[tool],
      snapping,
      midpoints: insertPoints,
      tools: {
        tool,
        onToolChange: setTool,
        snapping,
        onSnappingChange: setSnapping,
        insertPoints,
        onInsertPointsChange: (next) => {
          setInsertPoints(next);
          if (next) {
            setTool(AREA_TOOL.SELECT);
          }
        },
        canTakeParcel: Boolean(parcelGeometry),
        onTakeParcel: takeParcel,
        canUnassign: selectedIsRow,
        onUnassign: unassignSelected,
        canDelete: Boolean(selectedId),
        onDelete: deleteSelected,
      },
      assignDialog: assignPiece && {
        area: round2(planarArea(assignPiece.geometry)),
        options: rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => !row.geometry)
          .map(({ row, index }) => ({
            value: row.id,
            label: rowLabel(row, index),
          })),
        onAssign: assign,
        onCancel: closeAssign,
      },
    },
  };
};

export default useAreaDrawing;
