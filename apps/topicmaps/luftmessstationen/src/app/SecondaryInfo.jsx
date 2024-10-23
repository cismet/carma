import React, { useContext, useRef } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import SecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import SecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import {
  getLastYearMeasurements,
  getLastYearMinus1Measurements,
  getStatus4Value,
} from "./helper/convertItemToFeature";
import { Chart } from "chart.js";
import ReactChartkick, { ColumnChart } from "react-chartkick";
import { LOOKUP, MONTHS, opendataLinkSections } from "./helper/constants";
import Color from "color";
import Icon from "react-cismap/commons/Icon";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { version as reactCismapVersion } from "react-cismap/meta";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/luftmessstationen";

ReactChartkick.addAdapter(Chart);

const InfoPanel = () => {
  const { selectedFeature, items } = useContext(FeatureCollectionContext);
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const station = selectedFeature?.properties;
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
  if (station !== undefined) {
    let foto = station?.foto;

    let minHeight4MainSextion = undefined;
    if (foto !== undefined) {
      minHeight4MainSextion = 250;
    }

    // --- value and outage counter and avg of the last 10 years
    let valueCounter = 0;
    let outageCounter = 0;
    const avgs = JSON.parse(JSON.stringify(station?.mittelwerte));
    const last12ChartData = [];

    const last12Colors = [];
    const avgsChartData = [];
    const avgsColors = [];
    for (const year of Object.keys(station.werte)) {
      const yearValues = station.werte[year];
      for (let i = 0; i < Math.min(yearValues.length, 12); ++i) {
        if (yearValues[i] === -9999) {
          outageCounter++;
        } else {
          valueCounter++;
        }
      }
    }

    let last12;

    if (station?.werte && Object.keys(station?.werte).length > 0) {
      // --- measurements of the last 12 months
      let { values: lastYearValues, year: lastYear } =
        getLastYearMeasurements(station);
      let lastYearM1Values = getLastYearMinus1Measurements(station);

      let twoYearVals = [];
      if (lastYearM1Values) {
        let index = 0;
        for (const value of lastYearM1Values) {
          twoYearVals.push({ year: lastYear - 1, index, value });
          index++;
        }
      }
      if (lastYearValues) {
        let index = 0;
        for (const value of lastYearValues) {
          twoYearVals.push({ year: lastYear, index, value });
          index++;
        }
      }

      last12 = twoYearVals.slice(Math.max(twoYearVals.length - 12, 0));

      // --- avg of the last 10 years means delete the first n values
      //     where n=count of keys in werte-10
      const years = Object.keys(station.werte);
      const currentYear = new Date().getFullYear();

      for (const year of years) {
        if (year < currentYear - 10) {
          delete avgs[year];
        }
      }

      // ---create the chart objects

      for (const entry of last12) {
        const key = entry.year + " " + MONTHS[entry.index].shortname;
        if (entry.value !== -9999) {
          last12ChartData.push([key, entry.value]);
          last12Colors.push(
            new Color(LOOKUP[getStatus4Value(entry.value)].color).fade(0.5),
          );
        } else {
          last12ChartData.push([key, null]);
          last12Colors.push(null);
        }
      }

      for (const year of Object.keys(avgs)) {
        avgsChartData.push([year, avgs[year]]);
        avgsColors.push(
          new Color(LOOKUP[getStatus4Value(avgs[year])].color).fade(0.5),
        );
      }

      for (const year of Object.keys(avgs)) {
        avgsChartData.push([year, avgs[year]]);
      }
    }

    const subSections = [];
    const legend = (
      <div style={{ fontSize: "90%", textAlign: "center" }}>
        <div>
          <span style={{ whiteSpace: "nowrap" }}>
            <Icon style={{ color: LOOKUP.unauffaellig.color }} name="square" />{" "}
            unauffällig {"(≦ 35)"}
          </span>
          <span
            style={{ whiteSpace: "nowrap", marginLeft: 10, marginRight: 10 }}
          >
            <Icon style={{ color: LOOKUP.auffaellig.color }} name="square" />{" "}
            auffällig {"(> 35)"}
          </span>
          {windowSize?.width < 463 && <br />}
          <span style={{ whiteSpace: "nowrap" }}>
            <Icon style={{ color: LOOKUP.warnend.color }} name="square" />{" "}
            warnend {"(> 40)"}
          </span>
        </div>
        <div style={{ fontSize: "80%" }}> Messwerte in µg/m³</div>
      </div>
    );
    if (station?.bis === undefined) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="last12"
          bsStyle="info"
          header={"NO₂-Messwerte der letzten 12 Monate"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {legend}
            <ColumnChart
              legend={false}
              data={[
                {
                  data: last12ChartData,
                  library: {
                    backgroundColor: last12Colors,
                    borderColor: last12Colors,
                    hoverBackgroundColor: last12Colors,
                    hoverBorderColor: last12Colors,
                    legend: {
                      display: false,
                      labels: {
                        fontColor: "rgb(255, 99, 132)",
                      },
                    },
                  },
                },
              ]}
            />
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    if (Object.keys(avgsChartData).length > 0) {
      subSections.push(
        <SecondaryInfoPanelSection
          key="average10"
          bsStyle="warning"
          header={"NO₂-Jahresmittelwerte der letzten zehn Kalenderjahre"}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            {legend}
            <ColumnChart
              legend={false}
              data={[
                {
                  data: avgsChartData,
                  library: {
                    backgroundColor: avgsColors,
                    borderColor: avgsColors,
                    hoverBackgroundColor: avgsColors,
                    hoverBorderColor: avgsColors,
                  },
                },
              ]}
            />
            {/* <pre>{JSON.stringify(avgs, null, 2)}</pre> */}
          </div>
        </SecondaryInfoPanelSection>,
      );
    }
    let opendataLink = (
      <a
        href="https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler"
        target="_opendata"
      >
        diesem Link
      </a>
    );

    let stationsaktivitaet;
    const twothousandandeight = new Date("2008-01-01");

    if (new Date(station?.bis) < twothousandandeight) {
      //Fall 1
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>
          <p>
            Von {new Date(station?.von).toLocaleDateString()} bis{" "}
            {new Date(station?.bis).toLocaleDateString()} generierte diese
            Station NO₂-Messwerte.
            {opendataLinkSections[0]}
          </p>
        </div>
      );
    } else if (
      new Date(station?.von) < twothousandandeight &&
      new Date(station?.bis) >= twothousandandeight
    ) {
      //Fall 2
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>
          <p>
            Von {new Date(station?.von).toLocaleDateString()} bis{" "}
            {new Date(station?.bis).toLocaleDateString()} generierte diese
            Station insgesamt {valueCounter} NO₂-Messwerte (Ausfälle und
            Messwerte vor 1.1.2008 nicht berücksichtigt).
            {opendataLinkSections[1]}
          </p>
        </div>
      );
    } else if (
      new Date(station?.von) >= twothousandandeight &&
      station?.bis !== undefined
    ) {
      //Fall 3
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>

          <p>
            Von {new Date(station?.von).toLocaleDateString()} bis{" "}
            {new Date(station?.bis).toLocaleDateString()} generierte diese
            Station insgesamt {valueCounter} NO₂-Messwerte (Ausfälle nicht
            berücksichtigt).
            {opendataLinkSections[2]}
          </p>

          <b>Messausfälle:</b>
          {outageCounter > 0 && (
            <p>
              Diese Messstation generierte an {outageCounter}{" "}
              {outageCounter === 1 ? "Monat" : "Monaten"} einen Messausfall.
              Damit besitzt sie eine Zuverlässigkeit von{" "}
              {(
                Math.round(
                  (valueCounter / (valueCounter + outageCounter)) * 1000,
                ) / 10
              ).toLocaleString()}
              %.
            </p>
          )}
          {outageCounter === 0 && (
            <p>
              Diese Messstation lieferte in jedem Monat der Stationsaktivität
              einen NO₂-Messwert. Damit liegt bisher kein Messausfall vor.
            </p>
          )}
        </div>
      );
    } else if (
      new Date(station?.von) >= twothousandandeight &&
      station?.bis === undefined
    ) {
      //Fall 3.5
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>

          <p>
            Seit {new Date(station?.von).toLocaleDateString()} generierte diese
            Station {valueCounter} NO₂-Messwerte (Ausfälle nicht
            berücksichtigt).
            {opendataLinkSections[3]}
          </p>

          <b>Messausfälle:</b>
          {outageCounter > 0 && (
            <p>
              Diese Messstation generierte an {outageCounter}{" "}
              {outageCounter === 1 ? "Monat" : "Monaten"} einen Messausfall.
              Damit besitzt sie eine Zuverlässigkeit von{" "}
              {(
                Math.round(
                  (valueCounter / (valueCounter + outageCounter)) * 1000,
                ) / 10
              ).toLocaleString()}
              %.
            </p>
          )}
          {outageCounter === 0 && (
            <p>
              Diese Messstation lieferte in jedem Monat der Stationsaktivität
              einen NO₂-Messwert. Damit liegt bisher kein Messausfall vor.
            </p>
          )}
        </div>
      );
    } else if (
      new Date(station?.von) < twothousandandeight &&
      station?.bis === undefined
    ) {
      //Fall 4
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>
          <p>
            Seit {new Date(station?.von).toLocaleDateString()} generierte diese
            Station {valueCounter} NO₂-Messwerte (Ausfälle und Messwerte vor
            1.1.2008 nicht berücksichtigt).
          </p>

          {opendataLinkSections[1]}
        </div>
      );
    } else {
      //Fall 5
      stationsaktivitaet = (
        <div>
          <b>Stationsaktivität:</b>

          {station?.bis !== undefined && (
            <p>
              Von {new Date(station?.von).toLocaleDateString()} bis{" "}
              {new Date(station?.bis).toLocaleDateString()} generierte diese
              Station insgesamt {valueCounter} NO₂-Messwerte (Ausfälle nicht
              berücksichtigt).
            </p>
          )}
          {station?.bis === undefined && (
            <p>
              Seit {new Date(station?.von).toLocaleDateString()} generierte
              diese Station {valueCounter} NO₂-Messwerte (Ausfälle nicht
              berücksichtigt).
            </p>
          )}
          <b>Messausfälle:</b>
          {outageCounter > 0 && (
            <p>
              Diese Messstation generierte an {outageCounter}{" "}
              {outageCounter === 1 ? "Monat" : "Monaten"} einen Messausfall.
              Damit besitzt sie eine Zuverlässigkeit von{" "}
              {(
                Math.round(
                  (valueCounter / (valueCounter + outageCounter)) * 1000,
                ) / 10
              ).toLocaleString()}
              %.
            </p>
          )}
          {outageCounter === 0 && (
            <p>
              Diese Messstation lieferte in jedem Monat der Stationsaktivität
              einen NO₂-Messwert. Damit liegt bisher kein Messausfall vor.
            </p>
          )}
          {opendataLinkSections[1]}
        </div>
      );
    }

    return (
      <SecondaryInfo
        titleIconName="info-circle"
        title={"Datenblatt: Messstation für Stickstoffdioxid (NO₂)"}
        mainSection={
          <div style={{ width: "100%", minHeight: minHeight4MainSextion }}>
            {foto !== undefined && (
              <div
                style={{
                  textAlign: "center",
                  float: windowSize?.width < 500 ? undefined : "right",
                }}
              >
                <img
                  alt="Bild"
                  style={{
                    paddingLeft: 10,
                    paddingRight: 10,
                    horizontalAlignment: "center",
                    paddingBottom: "5px",
                  }}
                  src={foto}
                  width="250"
                />
              </div>
            )}
            <div
              style={{
                fontSize: "115%",
                padding: "10px",
                paddingTop: "0px",
              }}
            >
              <div>
                <b>Adresse:</b>

                <p>
                  {station?.strasse} {station?.hausnummer}{" "}
                  {station?.zusatzinfo && <span>({station?.zusatzinfo})</span>}
                </p>
                {stationsaktivitaet}
              </div>
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
