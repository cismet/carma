import React, { useRef, useState } from "react";
import { Alert } from "antd";
import AdminAreaTable from "./AdminAreaTable";
import AreaMap from "./AreaMap";
import { getColorFromCode } from "../../core/tools/helper";
import { planarArea, toUtm, toWgs84 } from "../../core/wizard/geometry";

const formatArea = (area) =>
  `${Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

/** Java's check: the drawn areas should add up to the parcel. Warning only. */
const AreaSummary = ({ parcelArea, rows }) => {
  const missing = rows.filter((row) => !row.geometry).length;
  const sum = rows.reduce(
    (total, row) => total + (row.geometry ? planarArea(row.geometry) : 0),
    0
  );
  const differs =
    parcelArea !== undefined && Math.abs(parcelArea - sum) >= 0.01;
  const text = [
    parcelArea !== undefined && `Flurstück: ${formatArea(parcelArea)}`,
    `Verwaltungsbereiche: ${formatArea(sum)}`,
    missing > 0 &&
      `${missing} ${
        missing === 1 ? "Bereich" : "Bereiche"
      } noch nicht gezeichnet`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Alert
      type={differs || missing > 0 ? "warning" : "success"}
      showIcon
      style={{ padding: "4px 12px" }}
      message={text}
    />
  );
};

const round2 = (number) => Math.round(number * 100) / 100;

// terra-draw rejects coordinates with more than 9 decimals
const roundCoords = (coords) =>
  typeof coords[0] === "number"
    ? coords.map((c) => Math.round(c * 1e9) / 1e9)
    : coords.map(roundCoords);

/** Rows that already have an area, as terra-draw snapshot features. */
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

/**
 * One Dienststelle holds the whole parcel; from two on, a row counts 0 m²
 * until its area is drawn.
 */
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

/** Dienststellen table; from two rows on, each row gets a drawn area. */
const DienststellenEditor = ({
  title,
  parcel,
  dienststellen,
  columns,
  newRow,
  onChange,
}) => {
  const rows = parcel.dienststellen;
  const [activeId, setActiveId] = useState(rows[0]?.id);
  const [drawMode, setDrawMode] = useState("none");
  const hostRef = useRef(null);
  // the host calls back synchronously while rows are still being updated
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const byId = new Map(dienststellen.map((d) => [d.id, d]));

  const commit = (nextRows) => {
    rowsRef.current = nextRows;
    onChange(nextRows);
  };

  /** Keeps rows and measurement polygons 1:1, after drawing, editing, deleting. */
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

    // a polygon without a row to hold it, and the one it replaced, go
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
        : withStartAreas(nextRows, parcel.area)
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

  return (
    <div className="flex flex-1 flex-col gap-2">
      {rows.length >= 2 && <AreaSummary parcelArea={parcel.area} rows={rows} />}
      <AdminAreaTable
        title={title}
        rows={rows}
        columns={columns}
        newRow={newRow}
        onChange={handleRowsChange}
        activeId={activeId}
        onActiveChange={setActiveId}
      />
      {rows.length >= 2 && (
        <>
          <AreaMap
            ref={hostRef}
            parcelGeometry={parcel.geometry}
            areas={areas}
            activeId={activeId}
            // read only when the map attaches, so it follows the rows
            initialFeatures={toMeasurementFeatures(rows)}
            onFeaturesChange={handleFeaturesChange}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
          />
        </>
      )}
    </div>
  );
};

export default DienststellenEditor;
