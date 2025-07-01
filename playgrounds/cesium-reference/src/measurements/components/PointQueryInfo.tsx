import React from "react";
import { PointMeasurementEntry } from "../types/MeasurementTypes";
import InfoRow from "../../components/InfoRow";

interface PointQueryInfoProps {
  data: PointMeasurementEntry;
}

export const PointQueryInfo: React.FC<PointQueryInfoProps> = ({ data }) => {
  const { height, longitude, latitude } = data.geometryWGS84 || {};
  return (
    <>
      <InfoRow label="Höhe:" value={`${height?.toFixed(3)} m`} />
      <InfoRow
        label="Koordinaten:"
        value={`${latitude?.toFixed(6)}°, ${longitude?.toFixed(6)}°`}
      />
    </>
  );
};

export default PointQueryInfo;
