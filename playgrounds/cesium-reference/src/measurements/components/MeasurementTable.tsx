import React, { useMemo } from "react";
import { Table, Typography } from "antd";
import type { Cartesian3, Viewer } from "cesium";
import { Math as CesiumMath } from "cesium";
import { PROJ4_CONVERTERS } from "@carma-commons/utils";
import "./MeasurementTable.css";

const { Title } = Typography;

type CoordinateDisplayMode = "cartesian" | "cartographic" | "utm32";

interface MeasurementTableProps {
  activeMeasurementPoints: Cartesian3[];
  viewer: Viewer | null;
  coordinateDisplayMode: CoordinateDisplayMode;
}

interface TableRecord {
  key: string;
  index: number;
  val1: string; // X, Lon, Easting
  val2: string; // Y, Lat, Northing
  val3: string; // Z, Height, Ellipsoidal Height
}

const MeasurementTable: React.FC<MeasurementTableProps> = ({
  activeMeasurementPoints,
  viewer,
  coordinateDisplayMode,
}) => {
  const tableDataSource = useMemo((): TableRecord[] => {
    if (!viewer) return [];
    return activeMeasurementPoints.map((point, index) => {
      let val1: string, val2: string, val3: string;

      switch (coordinateDisplayMode) {
        case "cartographic": {
          const cartographic =
            viewer.scene.globe.ellipsoid.cartesianToCartographic(point);
          val1 = CesiumMath.toDegrees(cartographic.longitude).toFixed(6);
          val2 = CesiumMath.toDegrees(cartographic.latitude).toFixed(6);
          val3 = cartographic.height.toFixed(2);
          break;
        }
        case "utm32": {
          const cartographic =
            viewer.scene.globe.ellipsoid.cartesianToCartographic(point);
          const lon = CesiumMath.toDegrees(cartographic.longitude);
          const lat = CesiumMath.toDegrees(cartographic.latitude);
          try {
            const [easting, northing] = PROJ4_CONVERTERS.CRS25832.forward([
              lon,
              lat,
            ]);
            val1 = easting.toFixed(2);
            val2 = northing.toFixed(2);
            val3 = cartographic.height.toFixed(2);
          } catch (error) {
            console.error("Error converting to UTM32:", error);
            val1 = "Error";
            val2 = "Error";
            val3 = "Error";
          }
          break;
        }
        case "cartesian":
        default:
          val1 = point.x.toFixed(2);
          val2 = point.y.toFixed(2);
          val3 = point.z.toFixed(2);
          break;
      }
      return {
        key: index.toString(),
        index: index + 1,
        val1,
        val2,
        val3,
      };
    });
  }, [activeMeasurementPoints, viewer, coordinateDisplayMode]);

  const columns = useMemo(() => {
    let col1Title = "X";
    let col2Title = "Y";
    let col3Title = "Z";

    if (coordinateDisplayMode === "cartographic") {
      col1Title = "Lon (°)";
      col2Title = "Lat (°)";
      col3Title = "Höhe in m*";
    } else if (coordinateDisplayMode === "utm32") {
      col1Title = "Rechtswert (m)";
      col2Title = "Hochwert (m)";
      col3Title = "Höhe in m*";
    }

    return [
      { title: "#", dataIndex: "index", key: "index", width: 50 },
      { title: col1Title, dataIndex: "val1", key: "val1" },
      { title: col2Title, dataIndex: "val2", key: "val2" },
      { title: col3Title, dataIndex: "val3", key: "val3" },
    ];
  }, [coordinateDisplayMode]);

  if (!activeMeasurementPoints.length) {
    return <Typography.Text>Noch keine Punkte gemessen</Typography.Text>;
  }

  return (
    <div className="measurement-table-container">
      <div className="measurement-table-header">
        <Title level={5} style={{ margin: 0, fontSize: "12px" }}>
          Gemessene Punkte:
        </Title>
      </div>
      <Table
        className="measurement-table"
        columns={columns}
        dataSource={tableDataSource}
        pagination={false}
        size="small"
        bordered
        scroll={{ y: 200 }}
      />
      {coordinateDisplayMode !== "cartesian" && (
        <Typography.Text
          type="secondary"
          className="measurement-table-footnote"
        >
          *Höhe über NHN (Normalhöhennull) GCG2016/DHHN2016 +/- 0.2m
        </Typography.Text>
      )}
    </div>
  );
};

export default MeasurementTable;
