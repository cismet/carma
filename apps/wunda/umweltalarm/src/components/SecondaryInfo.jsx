import React, { useContext } from "react";
import IconLink from "react-cismap/commons/IconLink";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { version as reactCismapVersion } from "react-cismap/meta";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const objectifyHits = (hits) => {
  const hitObject = {};

  // const testAnsprechpartner = {
  //   organisation: "cismet GmbH",
  //   name: "Thorsten Hell",
  //   email: "th@cismet.de",
  //   tel: "0681 965901 20",
  //   bemerkung: "nur zum testen",
  // };
  if (hits) {
    for (const hit of hits) {
      //      hit.ansprechpartner = testAnsprechpartner;
      if (hit.ansprechpartner === undefined) {
        hit.ansprechpartner = { firma: "", name: "" };
      }
      if (hitObject[hit.typ]) {
        hitObject[hit.typ].push(hit);
      } else {
        hitObject[hit.typ] = [hit];
      }
    }
  }
  return hitObject;
};

const footer = (
  <div style={{ fontSize: "11px" }}>
    <div>
      <b>
        {document.title} {getApplicationVersion(versionData)}
      </b>{" "}
      powered by{" "}
      <a href="https://cismet.de/" target="_cismet">
        cismet GmbH
      </a>{" "}
      auf Basis von{" "}
      <a href="http://leafletjs.com/" target="_cismet">
        Leaflet
      </a>{" "}
      und{" "}
      <a href="https://github.com/cismet/carma" target="_cismet">
        carma
      </a>{" "}
      |{" "}
      <a
        target="_blank"
        rel="noopener noreferrer"
        href="https://cismet.de/datenschutzerklaerung.html"
      >
        Datenschutzerklärung
      </a>{" "}
      |{" "}
      <a
        target="_blank"
        rel="noopener noreferrer"
        href="https://cismet.de/impressum.html"
      >
        Impressum
      </a>
    </div>
  </div>
);

const getAnsprechpartnerLinks = (ansprechpartner) => {
  let links = [];
  const keyPostfix = +JSON.stringify(ansprechpartner);
  if (ansprechpartner.tel) {
    links.push(
      <span key={`span.tel` + keyPostfix} style={{ padding: 4 }}>
        <IconLink
          key={`IconLink.tel` + keyPostfix}
          tooltip="Ansprechpartner Anrufen"
          href={"tel:" + ansprechpartner.tel}
          iconname="phone"
        />
      </span>,
    );
  }
  if (ansprechpartner.email) {
    links.push(
      <span key={`span.email` + keyPostfix} style={{ padding: 4 }}>
        <IconLink
          key={`IconLink.email` + keyPostfix}
          tooltip="E-Mail an Ansprechpartner schreiben"
          href={"mailto:" + ansprechpartner.email}
          iconname="envelope-square"
          target="_blank"
        />
      </span>,
    );
  }
  if (ansprechpartner.url) {
    links.push(
      <span key={`span.web` + keyPostfix} style={{ padding: 4 }}>
        <IconLink
          key={`IconLink.web` + keyPostfix}
          tooltip="Webseite"
          href={ansprechpartner.url}
          target="_blank"
          iconname="external-link-square"
        />
      </span>,
    );
  }
  return links;
};

const getAnsprechpartner = (ansprechpartner) => {
  if (Array.isArray(ansprechpartner)) {
    return (
      <div>
        {ansprechpartner.map((value, index) => {
          return (
            <div key={"ansprech_" + index}>
              {index > 0 && <br></br>}
              {/* <div style={{paddingLeft: "auto", paddingRight: "auto"}}>
            <b>Ansprechpartner</b>
          </div> */}
              <div
                style={{
                  paddingLeft: 10,
                  paddingRight: 10,
                  float: "right",
                  paddingBottom: "5px",
                }}
              >
                {getAnsprechpartnerLinks(value)}
              </div>
              <div>{value.firma}</div>
              <div>{value.name}</div>
              <div>{value.bemerkung}</div>
            </div>
          );
        })}
      </div>
    );
  } else {
    return (
      <div>
        {/* <div style={{paddingLeft: "auto", paddingRight: "auto"}}>
            <b>Ansprechpartner</b>
          </div> */}
        <div
          style={{
            paddingLeft: 10,
            paddingRight: 10,
            float: "right",
            paddingBottom: "5px",
          }}
        >
          {getAnsprechpartnerLinks(ansprechpartner)}
        </div>
        <div>{ansprechpartner.firma}</div>
        <div>{ansprechpartner.name}</div>
        <div>{ansprechpartner.bemerkung}</div>
      </div>
    );
  }
};

const getDienststellen = (dienststellen, ansprechpartner) => {
  var dienststellenArray = dienststellen.split("#");

  return (
    <span>
      {dienststellenArray.map((value, index) => {
        var styleParam =
          value === ansprechpartner?.firma.trim() &&
          dienststellenArray.length > 1
            ? { borderBottom: "1px solid black" }
            : {};

        return (
          <span key={"dienstst.span." + index} style={styleParam}>
            {index > 0 ? ", " : ""}
            {value}
          </span>
        );
      })}
    </span>
  );
};

const getSeparator = (name) => {
  return (
    <div
      style={{
        width: "100%",
        height: "12px",
        borderBottom: "1px solid #eeeeee",
        textAlign: "center",
        marginBottom: "15px",
        marginTop: "5px",
      }}
    >
      <span
        style={{
          fontSize: "16px",
          backgroundColor: "#FFFFFF",
          xcolor: "#aaa",
          padding: "0 10px",
        }}
      >
        {name}
      </span>
    </div>
  );
};

const InfoPanel = ({ hits }) => {
  const { history } = useContext(TopicMapContext);
  const lat = new URLSearchParams(history.location.search).get("lat");
  const long = new URLSearchParams(history.location.search).get("lng");
  const showRawData =
    new URLSearchParams(history.location.search).get("showRawData") !== null;

  const hitObject = objectifyHits(hits);

  if (hits !== undefined) {
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

    if (hits !== undefined) {
      if (
        hitObject.wasserverbaende ||
        hitObject.autobahnmeisterei ||
        hitObject.strassenmeisterei ||
        hitObject.stadtFlurstuecke
      ) {
        subSections.push(
          <SecondaryInfoPanelSection
            key={"standort" + hitObject.id}
            bsStyle="success"
            header={"Zuständigkeiten"}
          >
            {hitObject.wasserverbaende && getSeparator("Wasserverband")}

            {hitObject.wasserverbaende &&
              hitObject.wasserverbaende.map((value, index) => {
                return (
                  <div key={"wasserverbaende_" + index}>
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.autobahnmeisterei && getSeparator("Autobahnmeisterei")}
            {/* mehrere möglich*/}
            {hitObject.autobahnmeisterei &&
              hitObject.autobahnmeisterei.map((value, index) => {
                return (
                  <div key={"autm_" + index}>
                    {index > 0 && <br></br>}
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.strassenmeisterei && getSeparator("Straßenmeisterei")}
            {hitObject.strassenmeisterei && (
              <div>
                {hitObject.strassenmeisterei[0].ansprechpartner &&
                  getAnsprechpartner(
                    hitObject.strassenmeisterei[0].ansprechpartner,
                  )}
              </div>
            )}

            {hitObject.stadtFlurstuecke && getSeparator("Stadt Wuppertal")}
            {hitObject.stadtFlurstuecke &&
              hitObject.stadtFlurstuecke.length > 1 && (
                <div>
                  <div>
                    Es wurden {hitObject.stadtFlurstuecke.length} Flurstücke
                    gefunden. Nachfolgend wird das Flurstück mit dem geringsten
                    Abstand zum Fadenkreuz angezeigt.
                  </div>
                  <br></br>
                  <div>
                    <div>
                      <b>Flurstück: </b>
                      {hitObject.stadtFlurstuecke[0].flurstueck}
                    </div>
                    <div>
                      {hitObject.stadtFlurstuecke[0].dienststellen.split("#")
                        .length > 1 && <b>Dienststellen: </b>}
                      {hitObject.stadtFlurstuecke[0].dienststellen.split("#")
                        .length <= 1 && <b>Dienststelle: </b>}
                      {getDienststellen(
                        hitObject.stadtFlurstuecke[0].dienststellen,
                        Array.isArray(
                          hitObject.stadtFlurstuecke[0].ansprechpartner,
                        )
                          ? hitObject.stadtFlurstuecke[0].ansprechpartner[0]
                          : hitObject.stadtFlurstuecke[0].ansprechpartner,
                      )}
                      {/* {value.dienststellen.replace('#', ', ')} */}
                    </div>
                    <br />
                    {hitObject.stadtFlurstuecke[0].ansprechpartner &&
                      getAnsprechpartner(
                        Array.isArray(
                          hitObject.stadtFlurstuecke[0].ansprechpartner,
                        )
                          ? hitObject.stadtFlurstuecke[0].ansprechpartner[0]
                          : hitObject.stadtFlurstuecke[0].ansprechpartner,
                      )}
                  </div>
                </div>
              )}
            {hitObject.stadtFlurstuecke &&
              hitObject.stadtFlurstuecke.length === 1 &&
              hitObject.stadtFlurstuecke.map((value, index) => {
                return (
                  <div key={"stadtFlurstuecke_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Flurstück: </b>
                      {value.flurstueck}
                    </div>
                    <div>
                      {value.dienststellen.split("#").length > 1 && (
                        <b>Dienststellen: </b>
                      )}
                      {value.dienststellen.split("#").length <= 1 && (
                        <b>Dienststelle: </b>
                      )}
                      {getDienststellen(
                        value.dienststellen,
                        Array.isArray(value.ansprechpartner)
                          ? value.ansprechpartner[0]
                          : value.ansprechpartner,
                      )}
                      {/* {value.dienststellen.replace('#', ', ')} */}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(
                        Array.isArray(value.ansprechpartner)
                          ? value.ansprechpartner[0]
                          : value.ansprechpartner,
                      )}
                  </div>
                );
              })}
          </SecondaryInfoPanelSection>,
        );
      }

      if (
        hitObject.trinkwasserbrunnen ||
        hitObject.bimschWuppertal ||
        hitObject.bimschNrw ||
        hitObject.wasserschutzgebiete ||
        hitObject.naturschutzgebiete ||
        hitObject.landschaftsschutzgebiete ||
        hitObject.StoerfallBetriebeKlasse1 ||
        hitObject.StoerfallBetriebeKlasse2
      ) {
        subSections.push(
          <SecondaryInfoPanelSection
            key="standort"
            bsStyle="primary"
            header={"Schutzgebiete und Anlagen"}
          >
            {hitObject.trinkwasserbrunnen && getSeparator("Trinkwasserbrunnen")}

            {hitObject.trinkwasserbrunnen &&
              hitObject.trinkwasserbrunnen.map((value, index) => {
                return (
                  <div key={"trinkwasserbrunnen_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Abstand: </b>
                      {value.abstand} m
                    </div>
                    <div>
                      <b>Adresse Entnahmestelle: </b>
                      {value.str_name +
                        " " +
                        value.hsnr +
                        (value.zusatz ? value.zusatz : "")}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}
            {hitObject.bimschWuppertal &&
              getSeparator("BImschG-Anlage Wuppertal")}

            {hitObject.bimschWuppertal &&
              hitObject.bimschWuppertal.map((value, index) => {
                return (
                  <div key={"bimschWupp_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Betrieb: </b>
                      {value.b_firma1}
                    </div>
                    <div>
                      <b>Anlage: </b>
                      {value.anlag_bez}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.bimschNrw && getSeparator("BImschG-Anlage NRW")}

            {hitObject.bimschNrw &&
              hitObject.bimschNrw.map((value, index) => {
                return (
                  <div key={"bimschNrw_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Betrieb: </b>
                      {value.b_firma1}
                    </div>
                    <div>
                      <b>Anlage: </b>
                      {value.anlag_bez}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.wasserschutzgebiete &&
              getSeparator("Wasserschutzgebiet")}

            {/* mehrere möglich*/}
            {hitObject.wasserschutzgebiete &&
              hitObject.wasserschutzgebiete.map((value, index) => {
                return (
                  <div key={"wasser_" + index}>
                    {index > 0 && <br></br>}
                    {value.name && <div>{value.name}</div>}
                    <div>
                      <b>Schutzzone: </b>
                      {value.zone}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.naturschutzgebiete && getSeparator("Naturschutzgebiet")}

            {/* mehrere möglich*/}
            {hitObject.naturschutzgebiete &&
              hitObject.naturschutzgebiete.map((value, index) => {
                return (
                  <div key={"natur_" + index}>
                    {index > 0 && <br></br>}
                    <div>{value.nrw_name}</div>
                    <div>
                      <b>Objektkennung: </b>
                      {value.nrw_nummer}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.landschaftsschutzgebiete &&
              getSeparator("Landschaftsschutzgebiet")}

            {/* mehrere möglich*/}
            {hitObject.landschaftsschutzgebiete &&
              hitObject.landschaftsschutzgebiete.map((value, index) => {
                return (
                  <div key={"landschaft_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Schutzgebietstyp: </b>
                      {value.sg_typ === "LS"
                        ? "Landschaftsschutzgebiet"
                        : value.sg_typ}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.StoerfallBetriebeKlasse1 &&
              getSeparator("Störfallbetrieb Abstandsklasse 1")}

            {hitObject.StoerfallBetriebeKlasse1 &&
              hitObject.StoerfallBetriebeKlasse1.map((value, index) => {
                return (
                  <div key={"stoer1_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Betrieb: </b>
                      {value.betrieb}
                    </div>
                    <div>
                      <b>Lage: </b>
                      {value.lage}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}

            {hitObject.StoerfallBetriebeKlasse2 &&
              getSeparator("Störfallbetrieb Abstandsklasse 2")}

            {hitObject.StoerfallBetriebeKlasse2 &&
              hitObject.StoerfallBetriebeKlasse2.map((value, index) => {
                return (
                  <div key={"stoer2_" + index}>
                    {index > 0 && <br></br>}
                    <div>
                      <b>Betrieb: </b>
                      {value.betrieb}
                    </div>
                    <div>
                      <b>Lage: </b>
                      {value.lage}
                    </div>
                    <br />
                    {value.ansprechpartner &&
                      getAnsprechpartner(value.ansprechpartner)}
                  </div>
                );
              })}
          </SecondaryInfoPanelSection>,
        );
      }

      if (showRawData) {
        //remove the geometries
        const hitsForRawDisplay = JSON.parse(JSON.stringify(hits));

        for (const hit of hitsForRawDisplay) {
          delete hit.geojson;
        }

        const hitObjectForRawDisplay = objectifyHits(hitsForRawDisplay);

        subSections.push(
          <SecondaryInfoPanelSection
            key="standort"
            bsStyle="info"
            header={
              "Trefferobjekte (Raw Data ohne Geometrie): " +
              hits.length +
              " Treffer"
            }
          >
            <div
              style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}
            >
              <pre key="hitObject">
                {JSON.stringify(hitObjectForRawDisplay, null, 2)}
              </pre>
              {/* <pre key='hits'>{JSON.stringify(hitsForRawDisplay, null, 2)}</pre> */}
            </div>
          </SecondaryInfoPanelSection>,
        );
      }
    }
    return (
      <SecondaryInfo
        titleIconName="info-circle"
        title={
          "Datenblatt zu: " +
          Math.round(lat * 10000) / 10000 +
          ", " +
          Math.round(long * 1000) / 1000
        }
        mainSection={
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <div>
              Die Suche an der angegebene Position hat insgesamt {hits.length}{" "}
              Treffer ergeben:
              {display("Bezeichnung", hits?.bezeichnung)}
              {display("Flächengröße", hits?.groesse, (a) => (
                <span>
                  {a.toLocaleString()} m² (circa{" "}
                  {(Math.round((a / 10000) * 10) / 10).toLocaleString()} ha)
                </span>
              ))}
              {display("Stadtbezirk(e)", hits?.stadtbezirke, (sb) =>
                sb.join(", "),
              )}
              {display("Quartier(e)", hits?.quartiere, (q) => q.join(", "))}
              {display("Eigentümer", hits?.eigentuemer, (e) => e.join(", "))}
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
