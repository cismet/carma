import React, { useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import TableCustom from "../ui/tables/TableCustom";
import EditableTable from "./EditableTable";
import { useStartEditing } from "./EditControls";
import { withSort } from "./columns";

// One table for both modes, so sort, widths and selection carry over.
// columns: [{ key, title, width, view: antd column, edit: (update) => antd column }]
// view: { rows, activeRow, setActiveRow }; edit: tableProps from useDraftTable
// ready: false until the edit columns' Stammdaten are loaded
// fixHeight: the table fills its positioned parent, see TableCustom
// toEditRow maps a view row to its draft row
const SheetTable = ({
  columns,
  editable,
  ready = true,
  fixHeight = false,
  view,
  edit,
  toEditRow = (row) => edit.rows.find((draftRow) => draftRow.id === row.id),
}) => {
  const [sort, setSort] = useState({});
  const [columnWidths, setColumnWidths] = useState({});
  const startEditing = useStartEditing();
  const tableRef = useRef(null);
  const pendingFocus = useRef(null);

  const build = (part) =>
    withSort(
      columns.map((column) => ({
        ...part(column),
        key: column.key,
        title: column.title,
        width: column.width,
        ellipsis: true,
      })),
      sort
    );

  const editOnDoubleClick = (record, columnIndex) => {
    pendingFocus.current = { record, columnIndex };
    startEditing().then((started) => {
      if (!started) {
        pendingFocus.current = null;
      }
    });
  };

  useEffect(() => {
    const row = editable && view.activeRow && toEditRow(view.activeRow);
    if (row) {
      edit.onActiveChange(row.id);
    }
  }, [editable]);

  useEffect(() => {
    const pending = pendingFocus.current;
    const row = pending && toEditRow(pending.record);
    if (!editable || !ready || !row) {
      return;
    }
    pendingFocus.current = null;
    requestAnimationFrame(() =>
      tableRef.current
        ?.querySelector(`tr[data-row-key="${row.id}"]`)
        ?.children[pending.columnIndex]?.querySelector("input, button")
        ?.focus()
    );
  }, [editable, ready]);

  const shared = {
    tableLayout: "fixed",
    fixHeight,
    onSortChange: setSort,
    columnWidths,
    onColumnResize: setColumnWidths,
  };

  return (
    <div ref={tableRef}>
      {!editable ? (
        <TableCustom
          {...shared}
          columns={build((column) => column.view)}
          data={view.rows}
          activeRow={view.activeRow}
          setActiveRow={view.setActiveRow}
          onCellDoubleClick={editOnDoubleClick}
        />
      ) : ready ? (
        <EditableTable
          {...edit}
          {...shared}
          columns={(update) => build((column) => column.edit(update))}
          className="table-wrapper sheet-table"
        />
      ) : (
        <div className="flex justify-center p-8">
          <Spin />
        </div>
      )}
    </div>
  );
};

export default SheetTable;
