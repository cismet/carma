import React, { useState } from "react";
import TableCustom from "../ui/tables/TableCustom";
import RowActionButtons from "./RowActionButtons";

export const dienststelleLabel = (dienststelle) =>
  dienststelle
    ? `${dienststelle.ressort?.abkuerzung}.${dienststelle.abkuerzung_abteilung}`
    : "";

export const ColorMark = ({ color }) => (
  <span
    style={{
      flex: "none",
      width: "9px",
      height: "11px",
      marginRight: "6px",
      backgroundColor: color || "transparent",
    }}
  ></span>
);

const withWidths = (columns) => {
  const fixed = columns.filter((column) => column.width);
  if (fixed.length === columns.length) {
    return columns;
  }
  const taken = fixed.reduce(
    (sum, column) => sum + parseFloat(column.width),
    0
  );
  const share = (100 - taken) / (columns.length - fixed.length || 1);
  return columns.map((column) => ({ width: `${share}%`, ...column }));
};

const AdminAreaTable = ({
  title,
  rows,
  columns,
  newRow,
  onChange,
  activeId: controlledActiveId,
  onActiveChange,
  scroll,
}) => {
  const [ownActiveId, setOwnActiveId] = useState(rows[0]?.id);
  const activeId = onActiveChange ? controlledActiveId : ownActiveId;
  const setActiveId = onActiveChange ?? setOwnActiveId;

  const update = (id, changes) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  const addRow = () => {
    const row = newRow();
    onChange([...rows, row]);
    setActiveId(row.id);
  };

  const deleteRow = () => {
    const remaining = rows.filter((row) => row.id !== activeId);
    onChange(remaining);
    setActiveId(remaining[0]?.id);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {title && <span className="mr-auto font-medium">{title}</span>}
        <div className="ml-auto">
          <RowActionButtons
            onAdd={addRow}
            onRemove={deleteRow}
            removeDisabled={!rows.some((row) => row.id === activeId)}
          />
        </div>
      </div>
      <TableCustom
        columns={withWidths(columns(update))}
        data={rows}
        activeRow={rows.find((row) => row.id === activeId)}
        setActiveRow={(row) => setActiveId(row?.id)}
        scroll={scroll}
      />
    </div>
  );
};

export default AdminAreaTable;
