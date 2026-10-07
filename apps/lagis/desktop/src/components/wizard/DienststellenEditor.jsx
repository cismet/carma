import React, { useState } from "react";
import EditableTable from "../editing/EditableTable";
import AreaMap from "../editing/AreaMap";
import AreaSummary from "../editing/AreaSummary";
import useAreaDrawing from "../editing/useAreaDrawing";

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
  const { onRowsChange, mapProps } = useAreaDrawing({
    rows,
    pieces: parcel.pieces,
    onChange,
    activeId,
    onActiveChange: setActiveId,
    parcelGeometry: parcel.geometry,
    parcelArea: parcel.area,
    dienststellen,
  });

  return (
    <div className="flex flex-1 flex-col gap-2">
      {rows.length >= 2 && <AreaSummary parcelArea={parcel.area} rows={rows} />}
      <EditableTable
        title={title}
        rows={rows}
        columns={columns}
        newRow={newRow}
        onChange={onRowsChange}
        activeId={activeId}
        onActiveChange={setActiveId}
      />
      {rows.length >= 2 && (
        <AreaMap parcelGeometry={parcel.geometry} {...mapProps} />
      )}
    </div>
  );
};

export default DienststellenEditor;
