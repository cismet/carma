import { ConfigProvider, theme, Typography, Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import "../styles/cesium-ref-styles.css";

const { Title, Text } = Typography;

export interface InfoData {
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

interface InfoPanelProps {
  data: InfoData | null;
  onClose: () => void;
}

/* eslint-disable react/prop-types */
const InfoPanel: React.FC<InfoPanelProps> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <div className="panel-base panel-top-right">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            Punktabfrage
          </Title>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </div>

        {data.elevation !== undefined && (
          <div className="info-row">
            <Text strong>Höhe:</Text>
            <Text>{data.elevation.toFixed(3)} m</Text>
          </div>
        )}

        {/* Coordinate pair on same line */}
        {data.longitude !== undefined && data.latitude !== undefined && (
          <div className="info-row">
            <Text strong>Koordinaten:</Text>
            <Text>
              {data.latitude.toFixed(6)}°, {data.longitude.toFixed(6)}°
            </Text>
          </div>
        )}

        {/* NivP Data Section with cleaner organization */}
        {data.nivpData && (
          <>
            <h3
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "rgba(255, 255, 255, 0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "8px",
                marginTop: "16px",
              }}
            >
              Nächster Höhenfestpunkt:
            </h3>

            {/* Height difference display */}
            {data.heightDifference !== undefined && (
              <div className="info-row">
                <Text strong>Höhendifferenz:</Text>
                <Text
                  style={{
                    color: data.heightDifference > 0 ? "#ff7875" : "#73d13d",
                  }}
                >
                  {data.heightDifference > 0 ? "+" : ""}
                  {data.heightDifference.toFixed(3)} m
                </Text>
              </div>
            )}

            {/* Consolidated identification - merge Blatt and Lfd. Nummer */}
            <div className="info-row">
              <Text strong>Blatt / Nr.:</Text>
              <Text>
                {data.nivpData.dgk_blattnummer} /{" "}
                {data.nivpData.laufende_nummer}
              </Text>
            </div>

            {data.nivpData.punktnummer_nrw && (
              <div className="info-row">
                <Text strong>Punktnummer NRW:</Text>
                <Text>{data.nivpData.punktnummer_nrw}</Text>
              </div>
            )}

            <div className="info-row">
              <Text strong>Messungsjahr:</Text>
              <Text>{data.nivpData.messungsjahr}</Text>
            </div>

            <div className="info-row">
              <Text strong>Historisch:</Text>
              <Text>{data.nivpData.historisch ? "Ja" : "Nein"}</Text>
            </div>

            <div className="info-row">
              <Text strong>Festlegungsart:</Text>
              <Text>{data.nivpData.festlegungsart}</Text>
            </div>

            <div className="info-row">
              <Text strong>Lagegenauigkeit:</Text>
              <Text>{data.nivpData.lagegenauigkeit}</Text>
            </div>

            {/* Location and coordinates with single divider */}
            <div
              style={{
                margin: "8px 0",
                borderTop: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            />

            <div className="info-row-full">
              <Text strong>Lagebezeichnung:</Text>
              <Text style={{ wordBreak: "break-word", lineHeight: "1.4" }}>
                {data.nivpData.lagebezeichnung}
              </Text>
            </div>

            <div className="info-row">
              <Text strong>UTM32:</Text>
              <Text>
                {data.nivpData.x.toFixed(2)}, {data.nivpData.y.toFixed(2)} m
              </Text>
            </div>

            {/* Elevation data grouped together */}
            <div className="info-row">
              <Text strong>Höhe über NN:</Text>
              <Text>{data.nivpData.hoehe_ueber_nn.toFixed(3)} m</Text>
            </div>

            <div className="info-row">
              <Text strong>Höhe über NHN:</Text>
              <Text>{data.nivpData.hoehe_ueber_nhn.toFixed(3)} m</Text>
            </div>

            <div className="info-row">
              <Text strong>Höhe über NHN2016:</Text>
              <Text>{data.nivpData.hoehe_ueber_nhn2016.toFixed(3)} m</Text>
            </div>

            {/* Remarks - only if present and not empty */}
            {data.nivpData.bemerkung && data.nivpData.bemerkung.trim() && (
              <>
                <div
                  style={{
                    margin: "8px 0",
                    borderTop: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                />
                <div className="info-row-full">
                  <Text strong>Bemerkung:</Text>
                  <Text style={{ wordBreak: "break-word", lineHeight: "1.4" }}>
                    {data.nivpData.bemerkung}
                  </Text>
                </div>
              </>
            )}
          </>
        )}

        {data.additionalInfo &&
          Object.entries(data.additionalInfo).map(([key, value]) => (
            <div key={key} className="info-row">
              <Text strong>{key}:</Text>
              <Text>{value}</Text>
            </div>
          ))}

        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <Text type="secondary" style={{ fontSize: "12px" }}>
            Im Viewer für eine neue Abfrage auf die Karte klicken.
          </Text>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default InfoPanel;
