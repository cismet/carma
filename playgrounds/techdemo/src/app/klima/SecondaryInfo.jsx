import React, { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { version as reactCismapVersion } from "react-cismap/meta";

const InfoPanel = () => {
  const { selectedFeature, items } = useContext(FeatureCollectionContext);

  const angebot = selectedFeature?.properties;
  const footer = (
    <div style={{ fontSize: "11px" }}>
      <div>
        <b>
          {document.title} v{getApplicationVersion(versionData)}
        </b>
        :{" "}
        <a href="https://cismet.de/" target="_cismet">
          cismet GmbH
        </a>{" "}
        auf Basis von{" "}
        <a href="http://leafletjs.com/" target="_more">
          Leaflet
        </a>{" "}
        und{" "}
        <a href="https://cismet.de/#refs" target="_cismet">
          cids | react-cismap v{reactCismapVersion}
        </a>{" "}
        |{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://cismet.de/datenschutzerklaerung.html"
        >
          Datenschutzerklärung (Privacy Policy)
        </a>
      </div>
    </div>
  );
  if (angebot !== undefined) {
    let foto;
    if (angebot.bild !== undefined) {
      foto =
        "https://www.wuppertal.de/geoportal/standort_klima/fotos/" +
        angebot.bild;
    }

    const weitereAngebote = items.filter(
      (testItem) =>
        testItem?.standort.id === angebot.standort.id &&
        testItem.id !== angebot.id,
    );
    //data structure for "weitere Angebote"
    // gruppenwechsel for thema

    const addOffers = {};
    for (const ang of weitereAngebote) {
      if (addOffers[ang.thema.name] === undefined) {
        addOffers[ang.thema.name] = [];
      }
      addOffers[ang.thema.name].push(ang.kategorien);
    }

    const subSections = [
      <SecondaryInfoPanelSection
        key="standort"
        bsStyle="info"
        header={"Standort: " + angebot?.standort?.name}
      >
        <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
          {angebot?.standort && (
            <b>
              {angebot?.standort?.strasse} {angebot?.standort?.hausnummer}
              <br />
              {angebot?.standort?.plz} {angebot?.standort?.stadt}
              <br />
            </b>
          )}

          {angebot?.standort?.beschreibung && (
            <div>
              {angebot?.standort?.beschreibung}
              <br />
            </div>
          )}
          {angebot?.standort?.bemerkung && (
            <div>
              {angebot?.standort?.bemerkung} <br />
            </div>
          )}

          {angebot?.standort?.kommentar && (
            <div>
              <br></br> <i>{angebot?.standort?.kommentar} </i>
            </div>
          )}

          {angebot?.standort?.erreichbarkeit && (
            <div>
              <br></br> Erreichbarkeit über {angebot?.standort?.erreichbarkeit}
            </div>
          )}
        </div>
      </SecondaryInfoPanelSection>,
    ];
    let first = true;
    if (weitereAngebote.length > 0) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="weitereAngebote"
          header="Weitere Angebote an diesem Standort:"
          bsStyle="success"
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <table border={0} style={{ xwidth: "100%" }}>
              <tbody>
                {Object.keys(addOffers).map((key, index) => {
                  let separator = null;
                  if (first !== true) {
                    separator = (
                      <tr colspan={2}>
                        <td
                          style={{
                            paddingLeft: 5,
                            paddingright: 5,
                            borderBottom: "1px solid #dddddd",
                          }}
                        ></td>
                        <td
                          style={{
                            paddingLeft: 5,
                            paddingright: 5,
                            borderBottom: "1px solid #dddddd",
                          }}
                        ></td>
                      </tr>
                    );
                  }

                  first = false;
                  return (
                    <>
                      {separator}
                      <tr style={{ paddingBottom: 10 }} key={"addAng" + index}>
                        <td
                          style={{ verticalAlign: "top", padding: 5 }}
                          key={"addAng.L." + index}
                        >
                          {key}:
                        </td>
                        <td
                          style={{ verticalAlign: "top", padding: 5 }}
                          key={"addAng.R." + index}
                        >
                          {addOffers[key].map((val, index) => {
                            return (
                              <div key={"kategorien." + index}>
                                {val.join(", ")}
                              </div>
                            );
                          })}
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* <pre>{JSON.stringify(addOffers, null, 2)}</pre> */}
        </SecondaryInfoPanelSection>,
      );
    }

    let minHeight4MainSextion = undefined;
    if (foto !== undefined) {
      minHeight4MainSextion = 250;
    }
    return (
      <SecondaryInfo
        titleIconName="info-circle"
        title={"Datenblatt: " + angebot.kategorien.join(", ")}
        mainSection={
          <div style={{ width: "100%", minHeight: minHeight4MainSextion }}>
            {foto !== undefined && (
              <img
                alt="Bild"
                style={{
                  paddingLeft: 10,
                  paddingRight: 10,
                  float: "right",
                  paddingBottom: "5px",
                }}
                src={foto}
                width="250"
              />
            )}
            <div
              style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}
            >
              {angebot.beschreibung && (
                <b>
                  {angebot.beschreibung}
                  <br />
                </b>
              )}
              {angebot.bemerkung && (
                <div>
                  {angebot.bemerkung} <br />
                </div>
              )}
              {angebot.kommentar && (
                <div>
                  <br></br>
                  <i>{angebot.kommentar} </i>
                </div>
              )}
            </div>
          </div>
        }
        subSections={subSections}
        footer={footer}
      />
    );
  } else {
    return null;
  }
};
export default InfoPanel;
