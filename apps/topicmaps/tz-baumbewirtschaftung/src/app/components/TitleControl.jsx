import { useContext } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";

// Simple TitleControl modeled after potenzialflächen
// Expects: props.logout() and props.jwt
const TitleControl = ({
  logout,
  jwt,
  title = "Baumbewirtschaftung-Online",
}) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const { metaInformation } = useContext(FeatureCollectionContext) || {};

  let dateInfo;
  if (metaInformation && metaInformation.time) {
    const d = new Date(metaInformation.time);
    dateInfo = d.toLocaleString();
  }

  let secondaryInfo = "";
  let actiontext = "anmelden";

  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      secondaryInfo = payload.preferred_username || payload.sub || "angemeldet";
      actiontext = "abmelden";
    } catch (e) {
      secondaryInfo = "angemeldet";
      actiontext = "abmelden";
    }
  }

  const titleContent = (
    <div>
      <b>{title}</b> ({secondaryInfo + (dateInfo ? ", " + dateInfo : "")})
      <div style={{ float: "right", paddingRight: 10 }}>
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a
          style={{ color: "#337ab7", cursor: "pointer" }}
          onClick={() => {
            logout?.();
          }}
        >
          {actiontext}
        </a>
      </div>
    </div>
  );

  return (
    <table
      className="mode-container-switcher"
      style={{
        width: (windowSize?.width || 300) - 54 - 12 - 38 - 12 + "px",
        height: "30px",
        position: "absolute",
        left: 54,
        top: 12,
        zIndex: 555,
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "center",
              verticalAlign: "middle",
              background: "#ffffff",
              color: "black",
              opacity: "0.9",
              paddingLeft: "10px",
            }}
          >
            {titleContent}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default TitleControl;
