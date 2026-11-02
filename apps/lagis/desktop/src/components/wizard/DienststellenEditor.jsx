import { useState } from "react";
import SheetTable from "../editing/SheetTable";
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
      <SheetTable
        columns={columns}
        editable
        edit={{
          title,
          rows,
          newRow,
          onChange: onRowsChange,
          activeId,
          onActiveChange: setActiveId,
        }}
      />
      {rows.length >= 2 && (
        <AreaMap parcelGeometry={parcel.geometry} {...mapProps} />
      )}
    </div>
  );
};

export default DienststellenEditor;
