import { useContext } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut, faUser, faCloud } from "@fortawesome/free-solid-svg-icons";
import { useKampagne } from "../context/KampagneContext";
// Simple TitleControl modeled after potenzialflächen
// Expects: props.logout() and props.jwt
const TitleControl = ({
  logout,
  jwt,
  title = "BBW-Online",
  connectionError = false,
}) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const { metaInformation } = useContext(FeatureCollectionContext) || {};
  const {
    ready: kampagneReady,
    showAll,
    allowedCampaignIds,
    campaigns,
    keineCampaignId,
    viewSelection,
    setViewSelection,
  } = useKampagne();

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

  // Kampagne indicator: badge(s) for contractor accounts, dropdown filter for "*" admin.
  const formatLabel = (c) => (c?.firma ? `${c.name} (${c.firma})` : c?.name);
  const allowedCampaigns = campaigns.filter((c) =>
    allowedCampaignIds.includes(c.id)
  );

  let kampagneElement = null;
  if (kampagneReady && jwt) {
    if (showAll) {
      // Build options in a stable order:
      //   active default → real kampagnen (single id each) → keine → alle
      const realCampaigns = allowedCampaigns.filter(
        (c) => c.id !== keineCampaignId
      );
      const keineCampaign =
        keineCampaignId != null
          ? campaigns.find((c) => c.id === keineCampaignId)
          : null;

      const selectValue =
        typeof viewSelection === "number"
          ? `id:${viewSelection}`
          : viewSelection;

      const handleChange = (e) => {
        const v = e.target.value;
        if (v === "active" || v === "all") {
          setViewSelection(v);
        } else if (v.startsWith("id:")) {
          setViewSelection(Number(v.slice(3)));
        }
      };

      kampagneElement = (
        <>
          <span style={{ marginLeft: 12, color: "#555" }}>Ansicht:</span>
          <select
            value={selectValue}
            onChange={handleChange}
            style={{
              marginLeft: 6,
              fontSize: 13,
              padding: "1px 4px",
              border: "1px solid #ccc",
              borderRadius: 3,
              background: "#fff",
            }}
          >
            <option value="active">Aktive Kampagnen</option>
            {realCampaigns.map((c) => (
              <option key={c.id} value={`id:${c.id}`}>
                {formatLabel(c)}
              </option>
            ))}
            {keineCampaign && (
              <option value={`id:${keineCampaign.id}`}>Ohne Kampagne</option>
            )}
            <option value="all">Alle Bäume</option>
          </select>
        </>
      );
    } else if (allowedCampaigns.length > 0) {
      kampagneElement = (
        <span style={{ marginLeft: 8, color: "#555" }}>
          Kampagne: {allowedCampaigns.map(formatLabel).join(", ")}
        </span>
      );
    }
  }

  // Connection error indicator - cloud with strikethrough (black, positioned on right)
  const connectionErrorIndicator = connectionError ? (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        marginLeft: "8px",
        color: "#333",
      }}
      title="Offline"
    >
      <FontAwesomeIcon icon={faCloud} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "120%",
          height: "2px",
          backgroundColor: "#333",
          transform: "translate(-50%, -50%) rotate(-45deg)",
        }}
      />
    </span>
  ) : null;

  const titleContent = isNarrow ? (
    // Mobile layout: Single row with title, user icon, and logout icon
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>
        <b>{title}</b> (<FontAwesomeIcon icon={faUser} /> {username})
        {kampagneElement}
        {connectionErrorIndicator}
      </span>
      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
      <a
        style={{ color: "#337ab7", cursor: "pointer" }}
        onClick={() => {
          logout?.();
        }}
      >
        <FontAwesomeIcon icon={faSignOut} />
      </a>
    </div>
  ) : (
    // Desktop layout: Everything on one row
    <div>
      <b>{title}</b> (<FontAwesomeIcon icon={faUser} />{" "}
      {username + (dateInfo ? ", " + dateInfo : "")}){kampagneElement}
      {connectionErrorIndicator}
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
              textAlign: isNarrow ? "left" : "center",
              verticalAlign: "middle",
              background: "#ffffff",
              color: "black",
              opacity: "0.9",
              padding: "0 10px",
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
