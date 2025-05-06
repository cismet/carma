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
import Section from "react-cismap/topicmaps/menu/Section";

const VerdisOnlineHelp = () => {
  return (
    <div style={{ margin: 25 }}>
      <h3>Kompaktanleitung und Hintergrundinformationen</h3>
      <hr />
      <Menu10Datengrundlagen />
      <Menu20MeinKassenzeichen />
      <Section
        key="kartenhintergruende"
        sectionKey="kartenhintergruende"
        sectionTitle="Hintergrundkarten"
        sectionBsStyle="info"
        sectionContent={<Menu30KartenhintergruendeText />}
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
