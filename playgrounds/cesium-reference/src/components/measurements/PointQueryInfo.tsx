import React from "react";
import { Typography, Divider } from "antd";

const { Text } = Typography;

// Generic text formatter for long text fields
const formatLongText = (text: string): string => {
  return text
    .replace(/,\s*/g, '\n') // Replace commas with newlines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/(.{20,}?)\s+/g, '$1\n') // Add line breaks after ~20 chars at word boundaries
    .trim();
};

export interface PointQueryData {
  elevation?: number;
  longitude?: number;
  latitude?: number;
  nivpData?: {
    dgk_blattnummer: string;
    laufende_nummer: string;
    punktnummer_nrw?: string;
    messungsjahr: number;
    historisch: boolean;
    festlegungsart: string;
    lagegenauigkeit: string;
    lagebezeichnung: string;
    x: number;
    y: number;
    hoehe_ueber_nn: number;
    hoehe_ueber_nhn: number;
    hoehe_ueber_nhn2016: number;
    bemerkung?: string;
  };
  heightDifference?: number;
  additionalInfo?: Record<string, string>;
}

interface PointQueryInfoProps {
  data: PointQueryData;
}

const PointQueryInfo: React.FC<PointQueryInfoProps> = ({ data }) => {
  return (
    <>
      {data.elevation !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <Text strong>Höhe:</Text>
          <Text>{data.elevation.toFixed(3)} m</Text>
        </div>
      )}

      {data.longitude !== undefined && data.latitude !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <Text strong>Koordinaten:</Text>
          <Text>
            {data.latitude.toFixed(6)}°, {data.longitude.toFixed(6)}°
          </Text>
        </div>
      )}

      {data.nivpData && (
        <>
          <Divider orientation="left" orientationMargin="0">
            <Text type="secondary" style={{ fontSize: "11px", textTransform: "uppercase" }}>
              Nächster Höhenfestpunkt
            </Text>
          </Divider>

          {data.heightDifference !== undefined && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <Text strong>Höhendifferenz:</Text>
              <Text type={data.heightDifference > 0 ? "danger" : "success"}>
                {data.heightDifference > 0 ? "+" : ""}
                {data.heightDifference.toFixed(3)} m
              </Text>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Blatt / Nr.:</Text>
            <Text>
              {data.nivpData.dgk_blattnummer} / {data.nivpData.laufende_nummer}
            </Text>
          </div>

          {data.nivpData.punktnummer_nrw && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <Text strong>Punktnummer NRW:</Text>
              <Text>{data.nivpData.punktnummer_nrw}</Text>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Messungsjahr:</Text>
            <Text>{data.nivpData.messungsjahr}</Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Historisch:</Text>
            <Text>{data.nivpData.historisch ? "Ja" : "Nein"}</Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Festlegungsart:</Text>
            <Text>{data.nivpData.festlegungsart}</Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Lagegenauigkeit:</Text>
            <Text>{data.nivpData.lagegenauigkeit}</Text>
          </div>

          <Divider />

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Lagebezeichnung:</Text>
            <Text style={{ wordBreak: "break-word", lineHeight: "1.4", whiteSpace: "pre-line" }}>
              {formatLongText(data.nivpData.lagebezeichnung)}
            </Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>UTM32:</Text>
            <Text>
              {data.nivpData.x.toFixed(2)}, {data.nivpData.y.toFixed(2)} m
            </Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Höhe über NN:</Text>
            <Text>{data.nivpData.hoehe_ueber_nn.toFixed(3)} m</Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Höhe über NHN:</Text>
            <Text>{data.nivpData.hoehe_ueber_nhn.toFixed(3)} m</Text>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>Höhe über NHN2016:</Text>
            <Text>{data.nivpData.hoehe_ueber_nhn2016.toFixed(3)} m</Text>
          </div>

          {data.nivpData.bemerkung && data.nivpData.bemerkung.trim() && (
            <>
              <Divider />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <Text strong>Bemerkung:</Text>
                <Text style={{ wordBreak: "break-word", lineHeight: "1.4", whiteSpace: "pre-line" }}>
                  {formatLongText(data.nivpData.bemerkung)}
                </Text>
              </div>
            </>
          )}
        </>
      )}

      {data.additionalInfo &&
        Object.entries(data.additionalInfo).map(([key, value]) => (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <Text strong>{key}:</Text>
            <Text>{value}</Text>
          </div>
        ))}
    </>
  );
};

export default PointQueryInfo;
