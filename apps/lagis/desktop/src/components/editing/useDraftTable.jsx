import React, { useState } from "react";
import RowActionButtons from "./RowActionButtons";
import useEditSection from "./useEditSection";
import useEditableRows from "./useEditableRows";

// Wires one row list of a draft section to an EditableTable whose
// + / − buttons sit in the block header (InfoBlock controlBar).
// selection ([id, setId]) and onRowsChange let a host share the selection
// and intercept row changes, e.g. to sync drawn areas.
export const activeRowId = (rows, selectedId) =>
  rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id;

const useDraftTable = ({
  section,
  field,
  newRow,
  minusOffset,
  selection,
  onRowsChange,
}) => {
  const { editable, draft, patch } = useEditSection(section);
  const ownSelection = useState();
  const [selectedId, setSelectedId] = selection ?? ownSelection;
  const rows = draft?.[field] ?? [];
  const activeId = activeRowId(rows, selectedId);

  const tableProps = {
    rows,
    onChange: onRowsChange ?? ((next) => patch({ [field]: next })),
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
