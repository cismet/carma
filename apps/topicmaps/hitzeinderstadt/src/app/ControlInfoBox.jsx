import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";
import PropTypes from "prop-types";
import React from "react";
import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import Legend from "./Legend";
import { ResponsiveInfoBox } from "@carma-apps/portals";
// import ResponsiveInfoBox from "react-cismap/topicmaps/ResponsiveInfoBox";

/* eslint-disable jsx-a11y/anchor-is-valid */

const InfoBox = ({
  pixelwidth,
  selectedSimulations,
  simulationLabels,
  backgrounds,
  selectedBackgroundIndex,
  setBackgroundIndex,
  minified,
  minify,
  legendObject,
  featureInfoModeActivated = false,
  setFeatureInfoModeActivation,
  featureInfoValue,
  showModalMenu = () => {},
  mapClickListener,
  mapRef,
  mapCursor,
}) => {
  const legend = <Legend legendObjects={legendObject} />;
  if (featureInfoValue <= 0) {
    featureInfoValue = 0;
  }

  const legendTable = (
    <table
      onClick={(e) => e.stopPropagation()}
      key="legendTable"
      style={{ width: "100%" }}
    >
      <tbody>
        <tr>
          <td
            style={{
              opacity: "0.9",
              paddingLeft: "0px",
              paddingTop: "0px",
              paddingBottom: "0px",
            }}
          >
            {legend}
          </td>
        </tr>
      </tbody>
    </table>
  );

  let alwaysVisibleDiv = (
    <h4 style={{ marginTop: 8 }}>
      <FontAwesomeIcon icon={faSun} /> Hitzebelastungen in Wuppertal
    </h4>
  );

  const collapsibleDiv = (
    <div>
      <p style={{ marginTop: -5, marginBottom: 5, fontSize: "12px" }}>
        Kombinierbare Modellberechnungen (Stand 02/2019) von durch Hitze
        belasteten oder stark belasteten Arealen (IST-Zustand) sowie
        Zukunftsszenario für 2050 bis 2060{" "}
        <a
          onClick={() => showModalMenu("modellberechnungen")}
          className="renderAsLink"
        >
          (mehr)
        </a>
        {/* <a>
  			<Icon style={{ paddingLeft: 3, fontSize: 16 }} name="info-circle" />
  		</a> */}
      </p>
      <table border={0} style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: "center",
                paddingLeft: "0px",
                paddingTop: "0px",
                paddingBottom: "0px",
              }}
            >
              <h5
                style={{
                  textAlign: "center",
                  marginTop: "4px",
                  marginBottom: "1px",
                }}
              >
                <b>Modellberechnung</b>
              </h5>
            </td>
            <td
              style={{
                textAlign: "center",
                paddingLeft: "0px",
                paddingTop: "0px",
                paddingBottom: "0px",
              }}
            >
              <h5
                style={{
                  textAlign: "center",
                  marginTop: "4px",
                  marginBottom: "1px",
                }}
              >
                <b>Karte</b>
              </h5>
            </td>
          </tr>
          <tr>
            <td
              style={{
                textAlign: "center",
                paddingLeft: "0px",
                paddingTop: "0px",
                paddingBottom: "8px",
              }}
            >
              <table
                border={0}
                style={{
                  width: "100%",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        textAlign: "center",
                        verticalAlign: "center",
                      }}
                    >
                      {simulationLabels[0]} {simulationLabels[1]}
                    </td>
                    <td
                      style={{
                        textAlign: "center",
                        verticalAlign: "center",
                      }}
                    />
                  </tr>
                  <tr>
                    <td>
                      {simulationLabels[2]} {simulationLabels[3]}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td
              key={"bgprev" + selectedBackgroundIndex}
              style={{
                textAlign: "center",
                paddingLeft: "0px",
                paddingTop: "0px",
                paddingBottom: "12px",
                paddingRight: "4px",
              }}
            >
              {backgrounds.map((item, index) => {
                let style;
                if (selectedBackgroundIndex === index) {
                  style = {
                    border: "3px solid #5f83b8",
                    marginLeft: 7,
                  };
                } else {
                  style = {
                    //border: '3px solid #818180',
                    marginLeft: 7,
                  };
                }
                return (
                  <a
                    key={"backgroundChanger." + index}
                    title={item.title}
                    onClick={() => {
                      setBackgroundIndex(index);
                    }}
                  >
                    <img
                      alt=""
                      style={{ ...style, display: "inline" }}
                      width="36px"
                      src={item.src}
                    />
                  </a>
                );
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  console.log("XXX vor return");
  return (
    <ResponsiveInfoBox
      header={legendTable}
      pixelwidth={pixelwidth}
      fixedRow={false}
      alwaysVisibleDiv={alwaysVisibleDiv}
      collapsibleDiv={collapsibleDiv}
    />
  );
};

export default InfoBox;
