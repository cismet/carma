import React from "react";
import { Typography, Divider, Space } from "antd";

const { Text } = Typography;

// Generic text formatter for long text fields
const formatLongText = (text: string, maxLength = 32): string => {
  return text
    .replace(/,\s*/g, "\n") // Replace commas with newlines
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(new RegExp(`(.{${maxLength},}?)\\s+`, "g"), "$1\n") // Add line breaks after ~20 chars at word boundaries
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

const InfoRow: React.FC<{
  label: string;
  value: React.ReactNode;
  type?: "danger" | "success";
}> = ({ label, value, type }) => (
  <Space
    style={{
      width: "100%",
      justifyContent: "space-between",
      marginBottom: 8,
    }}
  >
    <Text strong style={{ whiteSpace: "nowrap" }}>
      {label}
    </Text>
    <Text type={type}>{value}</Text>
  </Space>
);

const PointQueryInfo: React.FC<PointQueryInfoProps> = ({ data }) => {
  const nivp = data?.nivpData;

  return (
    <>
      {data.elevation !== undefined && (
        <InfoRow label="Höhe:" value={`${data.elevation.toFixed(3)} m`} />
      )}

      {data.longitude !== undefined && data.latitude !== undefined && (
        <InfoRow
          label="Koordinaten:"
          value={`${data.latitude.toFixed(6)}°, ${data.longitude.toFixed(6)}°`}
        />
      )}

      {nivp && (
        <>
          <Divider orientation="left" orientationMargin={0}>
            <Text
              type="secondary"
              style={{ fontSize: 11, textTransform: "uppercase" }}
            >
              Nächster Höhenfestpunkt
            </Text>
          </Divider>

          <InfoRow
            label="Lagebezeichnung:"
            value={formatLongText(nivp.lagebezeichnung)}
          />

          {data.heightDifference !== undefined && (
            <InfoRow
              label="Höhendifferenz:"
              value={`${
                data.heightDifference > 0 ? "+" : ""
              }${data.heightDifference.toFixed(3)} m`}
              type={data.heightDifference > 0 ? "danger" : "success"}
            />
          )}

          <InfoRow
            label="Blatt / Nr.:"
            value={`${nivp.dgk_blattnummer} / ${nivp.laufende_nummer}`}
          />

          {nivp.punktnummer_nrw && (
            <InfoRow label="Punktnummer NRW:" value={nivp.punktnummer_nrw} />
          )}

          <InfoRow label="Messungsjahr:" value={nivp.messungsjahr} />
          <InfoRow
            label="Historisch:"
            value={nivp.historisch ? "Ja" : "Nein"}
          />
          <InfoRow label="Festlegungsart:" value={nivp.festlegungsart} />
          <InfoRow label="Lagegenauigkeit:" value={nivp.lagegenauigkeit} />
          <InfoRow
            label="UTM32:"
            value={`${nivp.x.toFixed(2)}, ${nivp.y.toFixed(2)} m`}
          />
          <InfoRow
            label="Höhe über NN:"
            value={`${nivp.hoehe_ueber_nn.toFixed(3)} m`}
          />
          <InfoRow
            label="Höhe über NHN:"
            value={`${nivp.hoehe_ueber_nhn.toFixed(3)} m`}
          />
          <InfoRow
            label="Höhe über NHN2016:"
            value={`${nivp.hoehe_ueber_nhn2016.toFixed(3)} m`}
          />

          {nivp.bemerkung && nivp.bemerkung.trim() && (
            <>
              <Divider />
              <InfoRow
                label="Bemerkung:"
                value={
                  <span
                    style={{
                      wordBreak: "break-word",
                      lineHeight: 1.4,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {formatLongText(nivp.bemerkung)}
                  </span>
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
};

export default PointQueryInfo;
