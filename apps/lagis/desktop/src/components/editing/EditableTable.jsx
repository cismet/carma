import React from "react";
import TableCustom from "../ui/tables/TableCustom";
import RowActionButtons from "./RowActionButtons";
import useEditableRows from "./useEditableRows";

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

// showActions=false: the host renders RowActionButtons itself, e.g. in a block header
const EditableTable = ({
  title,
  rows,
  columns,
  newRow,
  onChange,
  activeId,
  onActiveChange,
  scroll,
  fixHeight,
  className,
  tableLayout,
  showActions = true,
}) => {
  const editing = useEditableRows({
    rows,
    onChange,
    newRow,
    activeId,
    onActiveChange,
  });

  return (
    <div>
      {showActions && (
        <div className="mb-2 flex items-center gap-2">
          {title && <span className="mr-auto font-medium">{title}</span>}
          <div className="ml-auto">
            <RowActionButtons
              onAdd={editing.addRow}
              onRemove={editing.deleteRow}
              removeDisabled={editing.removeDisabled}
            />
          </div>
        </div>
      )}
      <TableCustom
        columns={withWidths(columns(editing.update))}
        data={rows}
        activeRow={rows.find((row) => row.id === editing.activeId)}
        setActiveRow={(row) => editing.setActiveId(row?.id)}
        scroll={scroll}
        fixHeight={fixHeight}
        tableLayout={tableLayout}
        {...(className ? { addClass: className } : {})}
      />
    </div>
  );
};

export default EditableTable;
