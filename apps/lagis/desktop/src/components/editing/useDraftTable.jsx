import React, { useState } from "react";
import RowActionButtons from "./RowActionButtons";
import useEditSection from "./useEditSection";
import useEditableRows from "./useEditableRows";

// Wires one row list of a draft section to an EditableTable whose
// + / − buttons sit in the block header (InfoBlock controlBar).
const useDraftTable = ({ section, field, newRow, minusOffset }) => {
  const { editable, draft, patch } = useEditSection(section);
  const [selectedId, setSelectedId] = useState();
  const rows = draft?.[field] ?? [];
  const activeId = rows.some((row) => row.id === selectedId)
    ? selectedId
    : rows[0]?.id;

  const tableProps = {
    rows,
    onChange: (next) => patch({ [field]: next }),
    newRow: (selected) => newRow(draft, selected),
    activeId,
    onActiveChange: setSelectedId,
    showActions: false,
    fixHeight: true,
  };
  const { addRow, deleteRow, removeDisabled } = useEditableRows(tableProps);

  return {
    editable,
    draft,
    actions: editable ? (
      <RowActionButtons
        onAdd={addRow}
        onRemove={deleteRow}
        removeDisabled={removeDisabled}
        minusOffset={minusOffset}
      />
    ) : null,
    tableProps,
  };
};

export default useDraftTable;
