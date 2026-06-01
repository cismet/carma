import { Alert } from "antd";
import { useKampagne } from "../context/KampagneContext";

const wrapStyle: React.CSSProperties = {
  position: "absolute",
  top: 54,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 600,
  maxWidth: 520,
  width: "90%",
};

export const KampagneBanner = () => {
  const { ready, error, configAttributeMissing, showAll, allowedCampaignIds } =
    useKampagne();

  if (!ready) return null;

  if (error) {
    return (
      <div style={wrapStyle}>
        <Alert type="error" showIcon message={error} />
      </div>
    );
  }

  if (configAttributeMissing) {
    return (
      <div style={wrapStyle}>
        <Alert
          type="warning"
          showIcon
          message="Keine Kampagne zugewiesen"
          description="Ihrem Konto ist keine Kampagne zugeordnet. Bitte wenden Sie sich an den Auftraggeber."
        />
      </div>
    );
  }

  if (!showAll && allowedCampaignIds.length === 0) {
    return (
      <div style={wrapStyle}>
        <Alert
          type="warning"
          showIcon
          message="Keine sichtbaren Kampagnen"
          description="Die zugewiesene Kampagne ist nicht (mehr) verfügbar. Bitte wenden Sie sich an den Auftraggeber."
        />
      </div>
    );
  }

  return null;
};

export default KampagneBanner;
