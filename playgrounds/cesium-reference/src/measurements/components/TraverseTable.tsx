import React, { FC, useMemo, useState } from "react";
import { Button, Table, Typography, Modal } from "antd";
import { Math as CesiumMath } from "cesium";
import "./TraverseTable.css";
import { TraverseMeasurementEntry } from "../types/MeasurementTypes";
import { useCesiumViewer } from "../../contexts/CesiumViewerContext";
import { CoordinateDisplayMode, useCRS } from "../CRSContext";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsToDot,
  faCircleXmark,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { removeNodeFromTraverseByTraverseId } from "../utils/cesiumTraverseEntities";

interface TraverseTableProps {
  traverse: TraverseMeasurementEntry;
}

interface TableRecord {
  key: string;
  index: number;
  val1: string; // X, Lon, Easting
  val2: string; // Y, Lat, Northing
  val3: string; // Z, Height, Ellipsoidal Height
  distance: string; // Segment distance
  cumulativeDistance: string; // Cumulative distance
  elevationChangeFromPrevious: string; // Elevation change from previous point
  elevationChangeFromFirst: string; // Elevation change from first point
  elevationChangeFromReference: string; // Elevation change from reference
  extras: React.ReactNode; // Action buttons
}

const TraverseTable: FC<TraverseTableProps> = ({ traverse }) => {
  const { coordinateDisplayMode, toCartographic } = useCRS();
  const { setReferencePoint, setMeasurements, referenceElevation } =
    useCesiumMeasurements();
  const { viewer } = useCesiumViewer();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const tableDataSource = useMemo((): TableRecord[] => {
    if (!viewer) return [];

    // Get the height of the first point for elevation change calculations
    const firstPointHeight = traverse.geometryWGS84[0]?.height || 0;

    return traverse.geometryECEF.map((point, index) => {
      let val1: string, val2: string, val3: string;

      const geographic =
        viewer.scene.globe.ellipsoid.cartesianToCartographic(point);

      const { latitude, longitude, height } = geographic;

      const latDegrees = CesiumMath.toDegrees(latitude);
      const lonDegrees = CesiumMath.toDegrees(longitude);

      switch (coordinateDisplayMode) {
        case CoordinateDisplayMode.Geographic: {
          val1 = lonDegrees.toFixed(5); // Reduced precision for compactness
          val2 = latDegrees.toFixed(5);
          val3 = height.toFixed(1);
          break;
        }
        case CoordinateDisplayMode.Cartographic: {
          try {
            const [easting, northing] = toCartographic.forward([
              lonDegrees,
              latDegrees,
            ]);
            val1 = easting.toFixed(1); // Reduced precision for compactness
            val2 = northing.toFixed(1);
            val3 = height.toFixed(1);
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
          val1 = point.x.toFixed(1); // Reduced precision for compactness
          val2 = point.y.toFixed(1);
          val3 = point.z.toFixed(1);
          break;
      }

      // Calculate distance values
      const distance =
        index === 0
          ? "0.0"
          : (traverse.derived?.segmentLengths[index] || 0).toFixed(2);
      const cumulativeDistance = (
        traverse.derived?.segmentLengthsCumulative[index] || 0
      ).toFixed(2);

      // Calculate elevation changes
      const previousPointHeight =
        index === 0
          ? height
          : traverse.geometryWGS84[index - 1]?.height || height;
      const elevationChangeFromPrevious =
        index === 0 ? "0.0" : (height - previousPointHeight).toFixed(2);
      const elevationChangeFromFirst = (height - firstPointHeight).toFixed(2);
      const elevationChangeFromReference = (
        height - referenceElevation
      ).toFixed(2);

      const extras = (
        <>
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
        </>
      );

      return {
        key: index.toString(),
        index: index + 1,
        val1,
        val2,
        val3,
        distance,
        cumulativeDistance,
        elevationChangeFromPrevious,
        elevationChangeFromFirst,
        elevationChangeFromReference,
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
    referenceElevation,
  ]);

  const columns = useMemo(() => {
    let col1Title = "X";
    let col2Title = "Y";
    let col3Title = "Z";

    if (coordinateDisplayMode === CoordinateDisplayMode.Geographic) {
      col1Title = "Lon °";
      col2Title = "Lat °";
      col3Title = "Höhe m";
    } else if (coordinateDisplayMode === CoordinateDisplayMode.Cartographic) {
      col1Title = "RW m";
      col2Title = "HW m";
      col3Title = "Höhe m";
    }

    return [
      {
        title: (
          <Button
            icon={<FontAwesomeIcon icon={faInfoCircle} />}
            type="text"
            size="small"
            onClick={() => setInfoModalVisible(true)}
            aria-label="Spalten-Erklärung"
          />
        ),
        dataIndex: "extras",
        key: "extras",
      },
      { title: "#", dataIndex: "index", key: "index" },

      { title: "Δs m", dataIndex: "distance", key: "distance" },
      {
        title: "Σs m",
        dataIndex: "cumulativeDistance",
        key: "cumulativeDistance",
      },
      {
        title: "Δh m",
        dataIndex: "elevationChangeFromPrevious",
        key: "elevationChangeFromPrevious",
      },
      {
        title: "Σh m",
        dataIndex: "elevationChangeFromFirst",
        key: "elevationChangeFromFirst",
      },
      {
        title: "Δhᵣ m",
        dataIndex: "elevationChangeFromReference",
        key: "elevationChangeFromReference",
      },
      { title: col3Title, dataIndex: "val3", key: "val3" },
      { title: col1Title, dataIndex: "val1", key: "val1" },
      { title: col2Title, dataIndex: "val2", key: "val2" },
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
        tableLayout="auto"
      />
      <Modal
        title="Spalten-Erklärung"
        open={infoModalVisible}
        onOk={() => setInfoModalVisible(false)}
        onCancel={() => setInfoModalVisible(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setInfoModalVisible(false)}
          >
            OK
          </Button>,
        ]}
      >
        <Typography.Text>
          {coordinateDisplayMode !== CoordinateDisplayMode.Cartesian && (
            <>
              *Höhe über NHN (GCG2016/DHHN2016 +/- 0.2m)
              <br />
            </>
          )}
          Δs = Segmentlänge
          <br />
          Σs = Kumulativ
          <br />
          Δh = Δ zu vorherigem Punkt
          <br />
          Σh = Δ zu Punkt 1<br />
          Δhᵣ = Δ zu Referenz
        </Typography.Text>
      </Modal>
    </>
  );
};

export default TraverseTable;
