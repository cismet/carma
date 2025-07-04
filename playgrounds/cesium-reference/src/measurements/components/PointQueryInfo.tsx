import React from "react";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import { InfoRow } from "../../components/InfoRow";
import { useCRS, CoordinateDisplayMode } from "../CRSContext";

interface PointQueryInfoProps {
  data: PointMeasurementEntry;
}

export const PointQueryInfo: React.FC<PointQueryInfoProps> = ({ data }) => {
  const { toCartographic, coordinateDisplayMode } = useCRS();
  const { height, longitude, latitude } = data.geometryWGS84 || {};

  let val1 = "",
    val2 = "",
    val3 = "";
  let label1 = "",
    label2 = "",
    label3 = "";

  switch (coordinateDisplayMode) {
    case CoordinateDisplayMode.Geographic: {
      label1 = "Lon (°)";
      label2 = "Lat (°)";
      label3 = "Höhe in m";
      val1 = longitude !== undefined ? longitude.toFixed(6) : "";
      val2 = latitude !== undefined ? latitude.toFixed(6) : "";
      val3 = height !== undefined ? height.toFixed(2) : "";
      break;
    }
    case CoordinateDisplayMode.Cartographic: {
      label1 = "Rechtswert (m)";
      label2 = "Hochwert (m)";
      label3 = "Höhe in m";
      if (longitude !== undefined && latitude !== undefined) {
        try {
          const [easting, northing] = toCartographic.forward([
            longitude,
            latitude,
          ]);
          val1 = easting.toFixed(2);
          val2 = northing.toFixed(2);
        } catch {
          val1 = val2 = "Error";
        }
      }
      val3 = height !== undefined ? height.toFixed(2) : "";
      break;
    }
    case CoordinateDisplayMode.Cartesian:
    default:
      label1 = "X";
      label2 = "Y";
      label3 = "Z";
      if (data.geometryECEF) {
        val1 = data.geometryECEF.x.toFixed(2);
        val2 = data.geometryECEF.y.toFixed(2);
        val3 = data.geometryECEF.z.toFixed(2);
      }
      break;
  }

  return (
    <>
      <InfoRow label={label1} value={val1} />
      <InfoRow label={label2} value={val2} />
      <InfoRow label={label3} value={`${val3} m`} />
    </>
  );
};

export default PointQueryInfo;
