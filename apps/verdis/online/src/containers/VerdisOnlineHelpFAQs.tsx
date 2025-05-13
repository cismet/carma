import {
  Menu10Datengrundlagen,
  Menu20MeinKassenzeichen,
  Menu30KartenhintergruendeText,
  Menu40Anleitung,
  Menu41Mailservice,
  Menu42Aenderungen,
  Menu50FAQ,
  Menu60Datenschutz,
} from "@carma-collab/wuppertal/verdis-online";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import Menu30Kartenhintergruende from "../app/components/helpandsettings/Menu30Kartenhintergruende";
import { useSelector } from "react-redux";
import { getMapping } from "../store/slices/mapping";
import type { CSSProperties } from "react";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faInfo } from "@fortawesome/free-solid-svg-icons";

const VerdisOnlineHelp = () => {
  const mapping = useSelector(getMapping);
  const modalBodyStyle: CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: "100vh",
  };
  return (
    <div style={{ margin: 25 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Icon
          icon={faInfo}
          style={{
            fontSize: "20px",
            marginBottom: "10px",
            marginRight: "10px",
            fontWeight: "bold",
          }}
        />
        <h3 style={{ fontSize: "20px" }}>
          Kompaktanleitung und Hintergrundinformationen
        </h3>
      </div>
      <hr />
      <Menu10Datengrundlagen />
      <Menu20MeinKassenzeichen />
      <Menu30Kartenhintergruende
        key="Kartenhintergruende"
        selectedBackgroundIndex={mapping.selectedBackgroundIndex}
        backgrounds={mapping.backgrounds}
        urlSearch={""}
      />
      <Menu40Anleitung />
      <Menu41Mailservice />
      <Menu42Aenderungen />
      <div id="myMenu" style={modalBodyStyle}>
        <Menu50FAQ />
      </div>
      <Menu60Datenschutz />
    </div>
  );
};

export default VerdisOnlineHelp;
