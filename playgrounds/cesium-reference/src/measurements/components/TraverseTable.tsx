import React, { useMemo } from "react";
import { Table, Typography } from "antd";
import { Math as CesiumMath } from "cesium";
import "./TraverseTable.css";
import { TraverseMeasurementEntry } from "../types/MeasurementTypes";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { CoordinateDisplayMode, useCRS } from "../CRSContext";

interface TraverseTableProps {
  traverse: TraverseMeasurementEntry;
}

interface TableRecord {
  key: string;
  index: number;
  val1: string; // X, Lon, Easting
  val2: string; // Y, Lat, Northing
  val3: string; // Z, Height, Ellipsoidal Height
}

const TraverseTable: React.FC<TraverseTableProps> = ({ traverse }) => {
  const { coordinateDisplayMode, toCartographic } = useCRS();
  const { viewer } = useCesiumViewer();
  const tableDataSource = useMemo((): TableRecord[] => {
    if (!viewer) return [];
    return traverse.geometryECEF.map((point, index) => {
      let val1: string, val2: string, val3: string;

      const geographic =
        viewer.scene.globe.ellipsoid.cartesianToCartographic(point); // kind of a misnomer here from Cesium it's to geogra

      const { latitude, longitude, height } = geographic;

      const latDegrees = CesiumMath.toDegrees(latitude);
      const lonDegrees = CesiumMath.toDegrees(longitude);

      switch (coordinateDisplayMode) {
        case CoordinateDisplayMode.Geographic: {
          val1 = lonDegrees.toFixed(6);
          val2 = latDegrees.toFixed(6);
          val3 = height.toFixed(2);
          break;
        }
        case CoordinateDisplayMode.Cartographic: {
          try {
            const [easting, northing] = toCartographic.forward([
              lonDegrees,
              latDegrees,
            ]);
            val1 = easting.toFixed(2);
            val2 = northing.toFixed(2);
            val3 = height.toFixed(2);
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
  }, [traverse, viewer, coordinateDisplayMode, toCartographic]);

  const columns = useMemo(() => {
    let col1Title = "X";
    let col2Title = "Y";
    let col3Title = "Z";

    if (coordinateDisplayMode === CoordinateDisplayMode.Geographic) {
      col1Title = "Lon (°)";
      col2Title = "Lat (°)";
      col3Title = "Höhe in m*";
    } else if (coordinateDisplayMode === CoordinateDisplayMode.Cartographic) {
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
