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

const VerdisOnlineHelp = () => {
  const mapping = useSelector(getMapping);
  return (
    <div style={{ margin: 25 }}>
      <h3>Kompaktanleitung und Hintergrundinformationen</h3>
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
      <Menu50FAQ />
      <Menu60Datenschutz />
    </div>
  );
};

export default VerdisOnlineHelp;
