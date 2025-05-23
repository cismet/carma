import {
  Menu10Datengrundlagen,
  Menu20MeinKassenzeichen,
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
import { KompaktanleitungFooter } from "@carma-collab/wuppertal/verdis-online";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../version.json";

const VerdisOnlineHelp = () => {
  const mapping = useSelector(getMapping);
  const modalBodyStyle: CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: "100vh",
  };
  const showOpened = true;
  const version = getApplicationVersion(versionData);

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
      <Menu10Datengrundlagen showOpened={showOpened} />
      <Menu20MeinKassenzeichen showOpened={showOpened} />
      <Menu30Kartenhintergruende
        key="Kartenhintergruende"
        selectedBackgroundIndex={mapping.selectedBackgroundIndex}
        backgrounds={mapping.backgrounds}
        urlSearch={""}
        showOpened={showOpened}
      />
      <Menu40Anleitung showOpened={showOpened} />
      <Menu41Mailservice showOpened={showOpened} />
      <Menu42Aenderungen showOpened={showOpened} />
      <div id="myMenu" style={modalBodyStyle}>
        <Menu50FAQ showOpened={showOpened} />
      </div>
      <Menu60Datenschutz showOpened={showOpened} />
      <div style={{ marginTop: "20px" }}>
        <KompaktanleitungFooter version={version} />
      </div>
    </div>
  );
};

export default VerdisOnlineHelp;
