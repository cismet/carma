import React, { useState, useRef, useEffect } from "react";
import { storiesCategory } from "./StoriesConf";
import GenericSecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import GenericSecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import Button from "react-bootstrap/Button";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

export default {
  title: storiesCategory + "SecondaryInfo",
};

export const Simple = () => {
  const [visible, setVisible] = useState(true);

  return (
    <TopicMapContextProvider>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <Button
          size='lg'
          variant='outline-primary'
          onClick={() => {
            setVisible(true);
          }}
        >
          Click to open again
        </Button>
      </div>
      <GenericSecondaryInfo
        visible={visible}
        onHide={() => {
          setVisible(false);
        }}
        uiHeight={700}
        imageUrl={"https://cismet.de/images/projects/wunda_l.png"}
        setVisibleState={setVisible}
        title={"cismet GmbH"}
        titleIconName='info'
        mainSection={
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <div>
              <b>Adresse:</b>
            </div>
            <div>cismet GmbH</div>
            <div>Im Kleegarten 6</div>
            <div>66636 Tholey</div>
            <br />
            <div>
              <b>Detailinformation:</b>
            </div>
            <div>
              Als ausgebildete Informatiker mit langjähriger Berufserfahrung verfügt unser Personal
              ausnahmelos über das notwendige Know-How zum Entwurf und der Umsetzung von
              Informationssystemen.{" "}
            </div>
            <br />
            <div>
              <b>Bemerkung:</b>
            </div>
            <div>
              Hierzu gehören ein grundlegendes und theoretisch fundiertes Verständnis der Bereiche
              Datenbankentwurf, Softwareentwurf und Programmierung.
            </div>
            <br />
            <div>
              <b>Öffnungszeiten:</b> Mo.-Fr. 07:00 - 19:00 Uhr
            </div>
            <br />
            <div>
              <b>Stellplätze:</b> ausreichend vorhanden
            </div>
          </div>
        }
        subSections={[
          <GenericSecondaryInfoPanelSection
            header='Entwicklung'
            bsStyle='primary'
            content={
              <div>
                Ein wichtiges Standbein ist die Auftragssoftwareentwicklung im Bereich von
                maßgeschneiderten, hochintegrierten Lösungen unter Verwendung von Open Source
                GIS-Software.
              </div>
            }
          />,
          <GenericSecondaryInfoPanelSection
            header='Forschung'
            bsStyle='success'
            content={
              <div>
                Schwerpunkt unserer Forschungsaktivitäten in zahlreichen EU-Projekten sind
                Integrationskonzepte & Architekturen, insbesondere im Bereich Geodatenintegration,
                die für den Aufbau von Geodateninfrastrukturen unerlässlich sind.
              </div>
            }
          />,
          <GenericSecondaryInfoPanelSection
            header='cids Toolkit'
            bsStyle='info'
            content={
              <div>
                Verwendung und Vermarktung der eigenen Geo- & Daten- Integrationsplattform
                cids/cismap als Werkzeug zum nachhaltigen Informationsinfrastrukturaufbau in
                Behörden und Unternehmen garantiert höchstmögliche Nachhaltigkeit.
              </div>
            }
          />,
          <GenericSecondaryInfoPanelSection
            header='Beratung'
            bsStyle='warning'
            content={
              <div>
                Wir sind seit langer Zeit im Umfeld von Architekturen großer und komplexer
                Softwaresysteme, Anwendung von Referenzmodellen, Serviceinfrastrukturen,
                GIS-integration international tätig.
              </div>
            }
          />,
          <GenericSecondaryInfoPanelSection
            header='Starke Partner'
            bsStyle='danger'
            content={
              <div>
                Durch unsere nationale und internationale, thematisch weit gestreute Projekte
                verfügen wir über ein weit reichendes Partner-Netzwerk mit renomierten Unternehmen,
                Behörden, Universitäten und Forschungseinrichtungen.
              </div>
            }
          />,
          <GenericSecondaryInfoPanelSection
            header='Veröffentlichungen'
            bsStyle='default'
            content={
              <div>
                Durch regelmäßige Publikationen in den Bereichen Entscheidungsunterstützende
                Systeme, Geoinfrastrukturen und Architekturen verteilter komplexer
                Informationssystem auf Tagungen und in Journals verbinden wir Theorie und Praxis.
              </div>
            }
          />,
        ]} //<GenericSecondaryInfoPanelSection >
      />
    </TopicMapContextProvider>
  );
};
