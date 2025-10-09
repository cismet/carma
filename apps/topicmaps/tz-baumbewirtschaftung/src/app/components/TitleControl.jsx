import { useContext } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut, faUser } from "@fortawesome/free-solid-svg-icons";
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

  let username = "";
  let actiontext = "anmelden";

  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      username = payload.preferred_username || payload.sub || "angemeldet";
      actiontext = "abmelden";
    } catch (e) {
      username = "angemeldet";
      actiontext = "abmelden";
    }
  }

  // Determine if we're in mobile/narrow mode
  const isNarrow = (windowSize?.width || 300) < 600;

  const titleContent = isNarrow ? (
    // Mobile layout: Title on first row, username + logout on second row
    <div>
      <div style={{ marginBottom: 4, textAlign: "center" }}>
        <b>{title}</b>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "0.9em",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <FontAwesomeIcon icon={faUser} />
          {username}
          {dateInfo && <span>, {dateInfo}</span>}
        </span>
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a
          style={{ color: "#337ab7", cursor: "pointer", marginLeft: 10 }}
          onClick={() => {
            logout?.();
          }}
        >
          {actiontext} <FontAwesomeIcon icon={faSignOut} />
        </a>
      </div>
    </div>
  ) : (
    // Desktop layout: Everything on one row
    <div>
      <b>{title}</b> (<FontAwesomeIcon icon={faUser} />{" "}
      {username + (dateInfo ? ", " + dateInfo : "")})
      <div style={{ float: "right", paddingRight: 10 }}>
        {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
        <a
          style={{ color: "#337ab7", cursor: "pointer" }}
          onClick={() => {
            logout?.();
          }}
        >
          {actiontext} <FontAwesomeIcon icon={faSignOut} />
        </a>
      </div>
    </div>
  );

  return (
    <table
      className="mode-container-switcher"
      style={{
        width: (windowSize?.width || 300) - 54 - 12 - 38 - 12 + "px",
        height: isNarrow ? "auto" : "30px",
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
              textAlign: isNarrow ? "left" : "center",
              verticalAlign: "middle",
              background: "#ffffff",
              color: "black",
              opacity: "0.9",
              padding: isNarrow ? "6px 10px" : "0 0 0 10px",
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
