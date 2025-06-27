import React from "react";
import { Card } from "antd";
import PointQueryInfo from "./PointQueryInfo";

export interface PointInfoData {
  title: string;
  elevation?: number;
  longitude?: number;
  latitude?: number;
  additionalInfo?: Record<string, string | number>;
  type: "terrain" | "nivp";
  heightDifference?: number; // Height difference between terrain and NivP point (if applicable)
  nivpData?: {
    laufende_nummer: string;
    messungsjahr: number;
    lagebezeichnung: string;
    punktnummer_nrw: string | null;
    bemerkung: string | null;
    festlegungsart: number;
    lagegenauigkeit: number;
    dgk_blattnummer: string;
    historisch: boolean;
    hoehe_ueber_nn: number;
    hoehe_ueber_nhn: number;
    hoehe_ueber_nhn2016: number;
    x: number;
    y: number;
  };
}

interface PointMeasurementPanelProps {
  data?: PointInfoData;
}

const PointMeasurementPanel: React.FC<PointMeasurementPanelProps> = ({
  data,
}) => {
  return (
    <Card size="small" title={data ? "Punktmessung" : undefined}>
      {data && (
        <PointQueryInfo
          data={{
            elevation: data.elevation,
            longitude: data.longitude,
            latitude: data.latitude,
            additionalInfo: data.additionalInfo
              ? Object.fromEntries(
                  Object.entries(data.additionalInfo).map(([key, value]) => [
                    key,
                    value.toString(),
                  ])
                )
              : undefined,
            heightDifference: data.heightDifference,
            nivpData: data.nivpData
              ? {
                  ...data.nivpData,
                  festlegungsart: data.nivpData.festlegungsart.toString(),
                  lagegenauigkeit: data.nivpData.lagegenauigkeit.toString(),
                  punktnummer_nrw: data.nivpData.punktnummer_nrw || undefined,
                  bemerkung: data.nivpData.bemerkung || undefined,
                }
              : undefined,
          }}
        />
      )}
    </Card>
  );
};

export default PointMeasurementPanel;
