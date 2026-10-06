import { useState } from "react";

// Pass activeId + onActiveChange to share the selection with a host
// that renders its own RowActionButtons.
const useEditableRows = ({
  rows,
  onChange,
  newRow,
  activeId: controlledActiveId,
  onActiveChange,
}) => {
  const [ownActiveId, setOwnActiveId] = useState(rows[0]?.id);
  const activeId = onActiveChange ? controlledActiveId : ownActiveId;
  const setActiveId = onActiveChange ?? setOwnActiveId;

  const update = (id, changes) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  // newRow gets the selected row, e.g. to prefill from it
  const addRow = () => {
    const row = newRow(rows.find((row) => row.id === activeId));
    onChange([...rows, row]);
    setActiveId(row.id);
  };

  const deleteRow = () => {
    const remaining = rows.filter((row) => row.id !== activeId);
    onChange(remaining);
    setActiveId(remaining[0]?.id);
  };

  return {
    activeId,
    setActiveId,
    update,
    addRow,
    deleteRow,
    removeDisabled: !rows.some((row) => row.id === activeId),
  };
};

export default useEditableRows;
