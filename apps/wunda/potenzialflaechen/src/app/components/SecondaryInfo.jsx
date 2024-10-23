import React, { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/potenzialflaechen-online";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const InfoPanel = () => {
  const { selectedFeature } = useContext(FeatureCollectionContext);

  const potenzialflaeche = selectedFeature?.properties;

  if (potenzialflaeche !== undefined) {
    const subSections = [];

    const display = (desc, value, valFunc) => {
      if (value && valFunc === undefined && Array.isArray(value) === false) {
        return (
          <div>
            <b>{desc}:</b> {value}
          </div>
        );
      } else if (
        value &&
        valFunc === undefined &&
        Array.isArray(value) === true
      ) {
        return (
          <div>
            <b>{desc}:</b> {value.join(", ")}
          </div>
        );
      } else if (value && valFunc !== undefined) {
        return (
          <div>
            <b>{desc}:</b> {valFunc(value)}
          </div>
        );
      }
    };

    if (
      potenzialflaeche?.lagebewertung_verkehr ||
      potenzialflaeche?.oepnv ||
      potenzialflaeche?.naehe_zu ||
      potenzialflaeche?.siedlungsraeumliche_lage ||
      potenzialflaeche?.topografie ||
      potenzialflaeche?.hang
    ) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="info"
          header={"Lagebeschreibung"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {display(
              "Lagebewertung Verkehr",
              potenzialflaeche?.lagebewertung_verkehr,
            )}
            {display("ÖPNV Qualität", potenzialflaeche?.oepnv)}
            {display("Nähe zu", potenzialflaeche?.naehe_zu)}
            {display(
              "Siedlungsräumliche Lage",
              potenzialflaeche?.siedlungsraeumliche_lage,
            )}
            {display("Topografie", potenzialflaeche?.topografie)}
            {display("Hangrichtung", potenzialflaeche?.hang)}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    if (
      potenzialflaeche?.regionalplan ||
      potenzialflaeche?.bplaene ||
      potenzialflaeche?.festsetzungen_bplan ||
      potenzialflaeche?.bauordnungsrecht_genehmigung ||
      potenzialflaeche?.bauordnungsrecht_genehmigung ||
      potenzialflaeche?.stand_bauordnungsrecht
    ) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="danger"
          header={<span>Planungsrecht / Bauordnungsrecht</span>}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {display("Regionalplan", potenzialflaeche?.regionalplan)}
            {/* {display("Flächennutzungsplan", potenzialflaeche?.)} */}
            {display("Bebauungspläne", potenzialflaeche?.bplaene)}
            {display("Festsetzungen", potenzialflaeche?.festsetzungen_bplan)}

            {/* bauordnungsrecht_baulast kommt noch dazu*/}
            {display(
              "Bauordnungsrecht (Stand)",
              potenzialflaeche?.stand_bauordnungsrecht,
            )}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }

    if (
      potenzialflaeche?.umgebungsnutzung ||
      potenzialflaeche?.brachflaechen ||
      potenzialflaeche?.jahr_brachflaeche ||
      potenzialflaeche?.bisherige_nutzung ||
      potenzialflaeche?.bestand_bebauung ||
      potenzialflaeche?.versiegelung ||
      potenzialflaeche?.aeussere_erschliessung ||
      potenzialflaeche?.wohnlagen ||
      potenzialflaeche?.klimainformationen
    ) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="success"
          header={"Erweiterte Informationen"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {display("Umgebungsnutzung", potenzialflaeche?.umgebungsnutzung)}
            {display("Brachfläche", potenzialflaeche?.brachflaechen)}
            {display("Nutzungsaufgabe", potenzialflaeche?.jahr_brachflaeche)}
            {display("Bisherige Nutzung", potenzialflaeche?.bisherige_nutzung)}
            {display("Bestand Bebauung", potenzialflaeche?.bestand_bebauung)}
            {display("Bestand Versiegelung", potenzialflaeche?.versiegelung)}
            {display(
              "Äußere Erschließung",
              potenzialflaeche?.aeussere_erschliessung,
            )}
            {display("Wohnlagen", potenzialflaeche?.wohnlagen)}
            {/* {display("Bodenrichtwerte", potenzialflaeche?.)} */}
            {/* {display("Stadtraumtypen", potenzialflaeche?.)} */}
            {display(
              "Klimainformationen",
              potenzialflaeche?.klimainformationen,
            )}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    if (potenzialflaeche?.beschreibung_flaeche) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="warning"
          header={"Beschreibung / Sachstand"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {potenzialflaeche?.beschreibung_flaeche
              .split("\n")
              .map((part, index) => {
                return <p key={"beschreibung.part" + index}>{part}</p>;
              })}

            {display("Quelle", potenzialflaeche?.quelle)}
            {display("Stand", potenzialflaeche?.stand, (d) => {
              try {
                const date = new Date(d);
                return (
                  date.getDate() +
                  "." +
                  (date.getMonth() + 1) +
                  "." +
                  date.getFullYear()
                );
              } catch (e) {
                return d;
              }
            })}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    if (potenzialflaeche?.notwendige_massnahmen) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="success"
          header={"Notwendige Maßnahmen / Nächste Schritte"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <p>{potenzialflaeche?.notwendige_massnahmen}</p>
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    if (
      potenzialflaeche?.kategorie ||
      potenzialflaeche?.potenzialart ||
      potenzialflaeche?.entwicklungsstand ||
      potenzialflaeche?.restriktionen ||
      potenzialflaeche?.empfohlene_nutzungen_wohnen ||
      potenzialflaeche?.wohneinheiten ||
      potenzialflaeche?.entwicklungsaussichten ||
      potenzialflaeche?.verfuegbarkeit ||
      potenzialflaeche?.verwertbarkeit ||
      potenzialflaeche?.handlungsprioritaet ||
      potenzialflaeche?.empfohlene_nutzungen ||
      potenzialflaeche?.revitalisierung ||
      potenzialflaeche?.handlungsdruck
    ) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="info"
          header={"Bewertung"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {display("Entwicklungsart", potenzialflaeche?.kategorie)}
            {display("Potenzialart", potenzialflaeche?.potenzialart)}
            {display("Entwicklungsstand", potenzialflaeche?.entwicklungsstand)}
            {display(
              "Restriktionen / Hemnisse",
              potenzialflaeche?.restriktionen,
            )}
            {display(
              "Empfohlene Art der Wohnnutzung",
              potenzialflaeche?.empfohlene_nutzungen_wohnen,
            )}
            {display(
              "Anzahl mög. Wohneinheiten",
              potenzialflaeche?.wohneinheiten,
              (t) => (
                <span>
                  {potenzialflaeche?.anzahl_wohneinheiten && (
                    <span> {potenzialflaeche?.anzahl_wohneinheiten}</span>
                  )}{" "}
                  {t}
                </span>
              ),
            )}

            {display(
              "Entwicklungsaussichten",
              potenzialflaeche?.entwicklungsaussichten,
            )}
            {display("Verfügbarkeit", potenzialflaeche?.verfuegbarkeit)}
            {display("Verwertbarkeit", potenzialflaeche?.verwertbarkeit)}
            {display(
              "Handlungspriorität (Verwaltung)",
              potenzialflaeche?.handlungsprioritaet,
            )}
            {display(
              "Empfohlene Nutzung",
              potenzialflaeche?.empfohlene_nutzungen,
            )}
            {display("Revitalisierung", potenzialflaeche?.revitalisierung)}
            {display("Handlungsdruck", potenzialflaeche?.handlungsdruck)}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    // if (potenzialflaeche?.interne_hinweise) {
    //   subSections.push(
    //     <SecondaryInfoPanelSection key='standort' bsStyle='secondary' header={"Interne Hinweise"}>
    //       <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
    //         {potenzialflaeche?.interne_hinweise.split("\n").map((part, index) => {
    //           return <p key={"interne_hinweise.part" + index}>{part}</p>;
    //         })}
    //       </div>
    //     </SecondaryInfoPanelSection>
    //   );
    // }

    const showRawData = new URLSearchParams(window.location.href).get(
      "showRawData",
    );
    if (showRawData !== null) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="standort"
          bsStyle="info"
          header={"Potenzialfläche (raw data): " + potenzialflaeche?.nummer}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <pre>{JSON.stringify(potenzialflaeche, null, 2)}</pre>
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    return (
      <SecondaryInfo
        titleIconName="info-circle"
        title={"Datenblatt: " + potenzialflaeche?.bezeichnung}
        mainSection={
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <div>
              {display("Nummer", potenzialflaeche?.nummer)}
              {display("Bezeichnung", potenzialflaeche?.bezeichnung)}
              {display("Kategorie", potenzialflaeche?.kampagne?.bezeichnung)}
              {display("Flächengröße", potenzialflaeche?.groesse, (a) => (
                <span>
                  {a.toLocaleString()} m² (circa{" "}
                  {(Math.round((a / 10000) * 10) / 10).toLocaleString()} ha)
                </span>
              ))}
              {display("Stadtbezirk(e)", potenzialflaeche?.stadtbezirke, (sb) =>
                sb.join(", "),
              )}
              {display("Quartier(e)", potenzialflaeche?.quartiere, (q) =>
                q.join(", "),
              )}
              {display("Eigentümer", potenzialflaeche?.eigentuemer, (e) =>
                e.join(", "),
              )}
            </div>
          </div>
        }
        subSections={subSections}
        footer={
          <SecondaryInfoFooter version={getApplicationVersion(versionData)} />
        }
      />
    );
  } else {
    return null;
  }
};
export default InfoPanel;
