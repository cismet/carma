import { useState, useEffect, useContext } from "react";
import { Table } from "antd";
import "./table-style.css";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useSelector } from "react-redux";
import { getFeatureCollection } from "../../../store/slices/mapping";
import { selectedFeatureFitBounds } from "../../../core/tools/helper";

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
}) => {
  const [selectedRow, setSelectedRow] = useState(activeRow);
  const { routedMapRef } = useContext(TopicMapContext);
  const features = useSelector(getFeatureCollection);

  const handleRowClick = (record) => {
    setActiveRow(record);
    setSelectedRow(record?.id);
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
  let paginationConfig = !pagination
    ? pagination
    : {
        // pageSize: 4,
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
          onDoubleClick: () => {
            if (routedMapRef && features) {
              const map = routedMapRef.leafletMap.leafletElement;
              const selectedFeature = features.filter(
                (f) => f[selectedFeatureKey]
              );

              selectedFeatureFitBounds(map, selectedFeature[0]);
            }
          },
          className:
            record?.id === activeRow?.id ? "ant-table-row-selected" : "",
        })}
        columns={columns}
        dataSource={data}
        pagination={paginationConfig}
        bordered={true}
        // scroll={{ y: "auto" }}
      />
    </div>
  );
};

export default TableCustom;
