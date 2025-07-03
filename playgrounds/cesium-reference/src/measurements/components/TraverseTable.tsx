import React, { useMemo } from "react";
import { Table, Typography } from "antd";
import type { Cartesian3, Viewer } from "cesium";
import { Math as CesiumMath } from "cesium";
import { PROJ4_CONVERTERS } from "@carma-commons/utils";
import "./TraverseTable.css";
import {
  CoordinateDisplayMode,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";

const { Title } = Typography;

interface TraverseTableProps {
  traverse: TraverseMeasurementEntry;
  viewer: Viewer | null;
}

interface TableRecord {
  key: string;
  index: number;
  val1: string; // X, Lon, Easting
  val2: string; // Y, Lat, Northing
  val3: string; // Z, Height, Ellipsoidal Height
}

const TraverseTable: React.FC<TraverseTableProps> = ({ traverse, viewer }) => {
  const { coordinateDisplayMode } = useCesiumMeasurements();
  const tableDataSource = useMemo((): TableRecord[] => {
    if (!viewer) return [];
    return traverse.geometryECEF.map((point, index) => {
      let val1: string, val2: string, val3: string;

      switch (coordinateDisplayMode) {
        case CoordinateDisplayMode.Geographic: {
          const cartographic =
            viewer.scene.globe.ellipsoid.cartesianToCartographic(point);
          val1 = CesiumMath.toDegrees(cartographic.longitude).toFixed(6);
          val2 = CesiumMath.toDegrees(cartographic.latitude).toFixed(6);
          val3 = cartographic.height.toFixed(2);
          break;
        }
        case CoordinateDisplayMode.UTM32: {
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
        case CoordinateDisplayMode.Cartesian:
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
  }, [traverse, viewer, coordinateDisplayMode]);

  const columns = useMemo(() => {
    let col1Title = "X";
    let col2Title = "Y";
    let col3Title = "Z";

    if (coordinateDisplayMode === CoordinateDisplayMode.Geographic) {
      col1Title = "Lon (°)";
      col2Title = "Lat (°)";
      col3Title = "Höhe in m*";
    } else if (coordinateDisplayMode === CoordinateDisplayMode.UTM32) {
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

  if (!traverse.geometryECEF.length) {
    return <Typography.Text>Noch keine Punkte gemessen</Typography.Text>;
  }
  return (
    <>
      <Table
        className="measurement-table"
        columns={columns}
        dataSource={tableDataSource}
        pagination={false}
        size="small"
        bordered
        scroll={{ y: 200 }}
      />
      {coordinateDisplayMode !== CoordinateDisplayMode.Cartesian && (
        <Typography.Text type="secondary">
          *Höhe über NHN (Normalhöhennull) GCG2016/DHHN2016 +/- 0.2m
        </Typography.Text>
      )}
    </>
  );
};

export default TraverseTable;
