import React from "react";
import { Math as CesiumMath } from "cesium";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import { InfoRow } from "../../components/InfoRow";
import { useCRS, CoordinateDisplayMode } from "../CRSContext";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { getRelativeENUDistance } from "../utils/geo";

interface PointQueryInfoProps {
  data: PointMeasurementEntry;
}

export const PointQueryInfo: React.FC<PointQueryInfoProps> = ({ data }) => {
  const { toCartographic, coordinateDisplayMode } = useCRS();
  const { referencePoint } = useCesiumMeasurements();
  const { height, longitude, latitude } = data.geometryWGS84 || {};

  let val1 = "",
    val2 = "",
    val3 = "";

  switch (coordinateDisplayMode) {
    case CoordinateDisplayMode.Geographic: {
      val1 = longitude !== undefined ? `𝑁 ${longitude.toFixed(6)}°` : "";
      val2 = latitude !== undefined ? `𝑂 ${latitude.toFixed(6)}°` : "";
      val3 = height !== undefined ? `𝘩 ${height.toFixed(2)}m` : "";
      break;
    }
    case CoordinateDisplayMode.Cartographic: {
      if (longitude !== undefined && latitude !== undefined) {
        try {
          const [easting, northing] = toCartographic.forward([
            longitude,
            latitude,
          ]);
          val1 = `𝘙 ${easting.toFixed(2)}`;
          val2 = `𝘏 ${northing.toFixed(2)}`;
        } catch {
          val1 = val2 = "Error";
        }
      }
      val3 = height !== undefined ? `𝘩 ${height.toFixed(2)}m` : "";
      break;
    }
    case CoordinateDisplayMode.Cartesian:
    default:
      if (data.geometryECEF) {
        val1 = `X ${data.geometryECEF.x.toFixed(2)}m`;
        val2 = `Y ${data.geometryECEF.y.toFixed(2)}m`;
        val3 = `Z ${data.geometryECEF.z.toFixed(2)}m`;
      }
      break;
  }

  const relativeRows = referencePoint
    ? (() => {
        const { east, north, up, distance, bearing } = getRelativeENUDistance(
          data.geometryECEF,
          referencePoint
        );
        if (distance)
          return {
            east: east.toFixed(2),
            north: north.toFixed(2),
            up: up.toFixed(2),
            distance: distance.toFixed(2),
            bearing: bearing ? CesiumMath.toDegrees(bearing).toFixed(1) : "",
          };
      })()
    : null;

  return (
    <div style={{ padding: "0 0.5rem" }}>
      <InfoRow label="Koordinaten" values={[val1, val2, val3]} />
      {relativeRows && (
        <InfoRow
          label="Relativ"
          values={[
            `𝘥 ${relativeRows.distance} m`,
            `⦨ ${relativeRows.bearing}°`,
            // only makes sense if we allow for rotation of local grid.
            //`(𝛥𝘙 ${relativeRows.east} m 𝛥𝘏 ${relativeRows.north}m) `,
            `𝛥𝘩 ${relativeRows.up}m`,
          ]}
        />
      )}
    </div>
  );
};

export default PointQueryInfo;
