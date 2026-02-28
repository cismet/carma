import React, { FC } from "react";
import { Divider, Typography } from "antd";
import { NivPoint } from "../types/NivPointTypes";
import { InfoRow } from "../../components/InfoRow";

const { Text } = Typography;

// Generic text formatter for long text fields
const formatLongText = (text: string, maxLength = 32): string => {
  return text
    .replace(/,\s*/g, "\n") // Replace commas with newlines
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(new RegExp(`(.{${maxLength},}?)\\s+`, "g"), "$1\n") // Add line breaks after ~20 chars at word boundaries
    .trim();
};

export const NivPointInfo: FC<{
  nivp?: NivPoint;
}> = ({ nivp }) => {
  const heightDifference = 0;

  return (
    <>
      <Text
        type="secondary"
        style={{ fontSize: 11, textTransform: "uppercase" }}
      >
        Nächster Höhenfestpunkt
      </Text>

      <InfoRow
        label="Lagebezeichnung:"
        value={formatLongText(nivp.lagebezeichnung)}
      />

      {heightDifference !== undefined && (
        <InfoRow
          label="Höhendifferenz:"
          value={`${heightDifference > 0 ? "+" : ""}${heightDifference.toFixed(
            3
          )} m`}
          type={heightDifference > 0 ? "danger" : "success"}
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
      <InfoRow label="Historisch:" value={nivp.historisch ? "Ja" : "Nein"} />
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
  );
};

export default NivPointInfo;
