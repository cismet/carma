import { Table } from "antd";
import "./table-style.css";
import { useSelector } from "react-redux";
import { getFeatureCollection } from "../../../store/slices/mapping";
import { selectedFeatureFitBounds } from "../../../core/tools/helper";
import { getLibreMapInstance } from "../../../core/tools/libreMapRegistry";

const MIN_COLUMN_WIDTH = 40;

// header cell with a drag strip on its right edge
const ResizableTitle = ({ onResize, children, ...rest }) => {
  if (!onResize) {
    return <th {...rest}>{children}</th>;
  }
  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.parentElement;
    const startX = event.clientX;
    const measured = [...th.parentElement.children].map(
      (cell) => cell.getBoundingClientRect().width
    );
    const move = (moveEvent) => onResize(measured, moveEvent.clientX - startX);
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      document.body.style.userSelect = "";
      // releasing over the header would land as a click and toggle the sort
      const swallow = (clickEvent) => clickEvent.stopPropagation();
      window.addEventListener("click", swallow, true);
      setTimeout(() => window.removeEventListener("click", swallow, true));
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };
  return (
    <th {...rest}>
      {children}
      <span className="column-resize-handle" onMouseDown={startResize} />
    </th>
  );
};

// a column trades width with its right neighbour; widths are keyed by column.key
// and kept in percent, so the table always fills its block without scrolling
const withResize = (columns, columnWidths, onColumnResize) =>
  columns.map((column, index) => ({
    ...column,
    width: columnWidths[column.key] ?? column.width,
    onHeaderCell: (col) => ({
      ...column.onHeaderCell?.(col),
      onResize:
        index < columns.length - 1 &&
        ((measured, delta) => {
          const left = measured[index];
          const right = measured[index + 1];
          const shift = Math.min(
            Math.max(delta, MIN_COLUMN_WIDTH - left),
            right - MIN_COLUMN_WIDTH
          );
          const total = measured.reduce((sum, width) => sum + width, 0);
          const percent = (width) => `${(width / total) * 100}%`;
          onColumnResize({
            ...Object.fromEntries(
              columns.map((other, i) => [other.key, percent(measured[i])])
            ),
            [column.key]: percent(left + shift),
            [columns[index + 1].key]: percent(right - shift),
          });
        }),
    }),
  }));

const TableCustom = ({
  columns,
  data,
  pagination = false,
  addClass = "table-wrapper",
  setActiveRow,
  activeRow,
  fixHeight = false,
  setActiveDataId,
  selectedFeatureKey,
  scroll,
  tableLayout,
  onSortChange,
  rowKey,
  columnWidths = {},
  onColumnResize,
  onCellDoubleClick,
}) => {
  const features = useSelector(getFeatureCollection);

  const handleRowClick = (record) => {
    setActiveRow(record);
    if (setActiveDataId) {
      setActiveDataId(record?.id);
    }
  };
  const fixStyles = {
    position: "absolute",
    padding: "0 0 8px",
    left: 0,
    top: 0,
    width: "100%",
  };
  return (
    <div
      className={addClass}
      style={
        fixHeight
          ? fixStyles
          : {
              padding: "0 0 8px",
            }
      }
    >
      <Table
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          onDoubleClick: (event) => {
            if (onCellDoubleClick) {
              window.getSelection()?.removeAllRanges();
              const cell = event.target.closest("td");
              onCellDoubleClick(record, cell?.cellIndex);
              return;
            }
            const map = getLibreMapInstance();
            if (map && features) {
              const selectedFeature = features.filter(
                (f) => f[selectedFeatureKey]
              );

              selectedFeatureFitBounds(map, selectedFeature[0]);
            }
          },
          className:
            record?.id === activeRow?.id ? "ant-table-row-selected" : "",
        })}
        columns={
          onColumnResize
            ? withResize(columns, columnWidths, onColumnResize)
            : columns
        }
        components={
          onColumnResize ? { header: { cell: ResizableTitle } } : undefined
        }
        dataSource={data}
        pagination={pagination ? {} : false}
        bordered={true}
        scroll={scroll}
        tableLayout={tableLayout}
        rowKey={rowKey}
        onChange={
          onSortChange &&
          ((_pagination, _filters, sorter) =>
            onSortChange({ columnKey: sorter.columnKey, order: sorter.order }))
        }
      />
    </div>
  );
};

export default TableCustom;
