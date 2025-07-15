import React, { Dispatch, useMemo } from "react";
import { Button, Table, Typography } from "antd";
import { Math as CesiumMath, Cartesian3 } from "cesium";
import "./TraverseTable.css";
import {
  isTraverseMeasurementEntry,
  MeasurementCollection,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { CoordinateDisplayMode, useCRS } from "../CRSContext";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsToDot,
  faCircleXmark,
} from "@fortawesome/free-solid-svg-icons";

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

// Helper function to recalculate segment lengths from points
const calculateSegmentLengths = (
  points: Cartesian3[]
): {
  segmentLengths: number[];
  segmentLengthsCumulative: number[];
  totalLength: number;
} => {
  const segmentLengths: number[] = [0]; // First point has no segment
  const segmentLengthsCumulative: number[] = [0];
  let totalLength = 0;

  for (let i = 1; i < points.length; i++) {
    const segmentLength = Cartesian3.distance(points[i], points[i - 1]);
    segmentLengths[i] = segmentLength;
    totalLength += segmentLength;
    segmentLengthsCumulative[i] = totalLength;
  }

  return { segmentLengths, segmentLengthsCumulative, totalLength };
};

const removeNodeFromTraverseByTraverseId = (
  setMeasurements: Dispatch<React.SetStateAction<MeasurementCollection>>,
  id: string,
  nodeIndex: number
) => {
  setMeasurements((prev: MeasurementCollection) => {
    return prev.map((measurement) => {
      if (measurement.id === id && isTraverseMeasurementEntry(measurement)) {
        const newGeometry = [...measurement.geometryECEF];
        newGeometry.splice(nodeIndex, 1);

        // Recalculate derived data for the modified traverse
        const { segmentLengths, segmentLengthsCumulative, totalLength } =
          calculateSegmentLengths(newGeometry);

        // Update geographic coordinates by removing the corresponding point
        const newGeographicPoints = [...measurement.geometryWGS84];
        newGeographicPoints.splice(nodeIndex, 1);

        return {
          ...measurement,
          geometryECEF: newGeometry,
          geometryWGS84: newGeographicPoints,
          derived: {
            segmentLengths,
            segmentLengthsCumulative,
            totalLength,
          },
          shouldRebuildEntry: true, // Flag to indicate entry needs to be rebuilt
          timestamp: Date.now(), // Update timestamp to trigger re-rendering
        };
      }
      return measurement;
    });
  });
};

const TraverseTable: React.FC<TraverseTableProps> = ({ traverse }) => {
  const { coordinateDisplayMode, toCartographic } = useCRS();
  const { setReferencePoint, setMeasurements } = useCesiumMeasurements();
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
            console.error("Error converting to Cartographic CRS", error);
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

      const extras = (
        <>
          <Button
            icon={<FontAwesomeIcon icon={faArrowsToDot} />}
            type="text"
            size="small"
            onClick={() => {
              console.debug(
                `[TraverseTable] Setting reference point for ${traverse.id}`
              );
              setReferencePoint(point);
            }}
            aria-label={`Polygonzug Referenzpunkt`}
          />
          <Button
            icon={<FontAwesomeIcon icon={faCircleXmark} />}
            type="text"
            size="small"
            onClick={() => {
              console.debug(`[TraverseTable] Deleting point in ${traverse.id}`);
              removeNodeFromTraverseByTraverseId(
                setMeasurements,
                traverse.id,
                index
              );
            }}
            aria-label={`Polygonzug ${traverse.id} löschen`}
          />
        </>
      );

      return {
        key: index.toString(),
        index: index + 1,
        val1,
        val2,
        val3,
        extras,
      };
    });
  }, [
    traverse,
    viewer,
    coordinateDisplayMode,
    toCartographic,
    setMeasurements,
    setReferencePoint,
  ]);

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
      { title: "#", dataIndex: "index", key: "index", width: "25px" },
      { title: col1Title, dataIndex: "val1", key: "val1" },
      { title: col2Title, dataIndex: "val2", key: "val2" },
      { title: col3Title, dataIndex: "val3", key: "val3", width: "50px" },
      { title: "", dataIndex: "extras", key: "extras" },
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
