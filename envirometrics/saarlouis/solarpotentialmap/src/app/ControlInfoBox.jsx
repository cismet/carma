import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import L from "leaflet";
import PropTypes from "prop-types";
import React, { useContext } from "react";
import CollapsibleWell from "react-cismap/commons/CollapsibleWell";
import Legend from "./Legend";
import ResponsiveInfoBox from "react-cismap/topicmaps/ResponsiveInfoBox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

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
  secondaryInfoBoxElements,
  featureInfoValue,
  showModalMenu = () => {},
  mapClickListener,
  mapRef,
  mapCursor,
}) => {
  const { routedMapRef } = useContext(TopicMapContext);

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
      <FontAwesomeIcon icon={faSun} /> Solarpotenzial in Saarlouis
    </h4>
  );

  const collapsibleDiv = (
    <div>
      <p style={{ marginTop: -5, marginBottom: 5, fontSize: "12px" }}>
        Das Solardachpotenzial stellt die theoretisch mögliche Erzeugung
        elektrischer Energie durch eine Photovoltaikanlage in MWh/Jahr für jedes
        Gebäude in{" "}
        <a
          className="renderAsLink"
          onClick={() => {
            const bbox = [
              6.736862665166406, 49.30398315439027, 6.758356764405106,
              49.32209034811499,
            ];
            routedMapRef.leafletMap.leafletElement.fitBounds(
              [
                [bbox[3], bbox[2]],
                [bbox[1], bbox[0]],
              ],
              {
                animate: true, // Enable animation
                duration: 1.0, // Duration in seconds (optional)
                easeLinearity: 0.25, // Smoothness of the animation (optional)
              }
            );
          }}
        >
          Saarlouis-Innenstadt
        </a>{" "}
        und{" "}
        <a
          className="renderAsLink"
          onClick={() => {
            const bbox = [
              6.804050836231161, 49.37080682277991, 6.832036059957917,
              49.38862731630634,
            ];
            routedMapRef.leafletMap.leafletElement.fitBounds(
              [
                [bbox[3], bbox[2]],
                [bbox[1], bbox[0]],
              ],
              {
                animate: true, // Enable animation
                duration: 1.0, // Duration in seconds (optional)
                easeLinearity: 0.25, // Smoothness of the animation (optional)
              }
            );
          }}
        >
          Nalbach Bilsdorf
        </a>{" "}
        dar.{" "}
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
                width: "50%",
              }}
            >
              {/* <h5
                style={{
                  textAlign: "center",
                  marginTop: "4px",
                  marginBottom: "1px",
                }}
              >
                <b>Modellberechnung</b>
              </h5> */}
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
                  {/* <tr>
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
                  </tr> */}
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
                    <img alt="" style={style} width="36px" src={item.src} />
                  </a>
                );
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <ResponsiveInfoBox
      secondaryInfoBoxElements={secondaryInfoBoxElements}
      header={legendTable}
      pixelwidth={pixelwidth}
      fixedRow={false}
      alwaysVisibleDiv={alwaysVisibleDiv}
      collapsibleDiv={collapsibleDiv}
    />
  );
};

export default InfoBox;
