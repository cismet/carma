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

const AdminAreaTable = ({
  title,
  rows,
  columns,
  newRow,
  onChange,
  activeId: controlledActiveId,
  onActiveChange,
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
        columns={columns(update).map((column, _, all) => ({
          ...column,
          width: `${100 / all.length}%`,
        }))}
        data={rows}
        activeRow={rows.find((row) => row.id === activeId)}
        setActiveRow={(row) => setActiveId(row?.id)}
      />
    </div>
  );
};

export default AdminAreaTable;
