import React from "react";
import Color from "color";
import Icon from "react-cismap/commons/Icon";
import Well from "react-cismap/commons/Well";

// import { getRoundedValueStringForValue } from "../helper";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Comp = ({
  setFeatureInfoModeActivation,
  featureInfoValue,
  showModalMenu,
  legendObject,
  selectedFeature,
}) => {
  let headerColor = "#7e7e7e";
  if (featureInfoValue !== undefined && legendObject) {
    for (const item of legendObject) {
      if (featureInfoValue > item.lt) {
        headerColor = item.bg;
      }
    }
  }
  console.log("headerColor", headerColor);

  let textColor = "black";
  let backgroundColor = new Color(headerColor);
  if (backgroundColor.isDark()) {
    textColor = "white";
  }
  if (featureInfoValue <= 0) {
    featureInfoValue = 0;
  }
  return (
    <div
      //onClick={(e) => e.stopPropagation()}
      key="featureInfoModeBox"
      id="featureInfoModeBox"
      style={{
        pointerEvents: "auto",
        marginBottom: 5,
        float: "right",
        width: "205px",
        height_: "145px",
      }}
    >
      <table style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                opacity: "0.9",
                paddingLeft: "2px",
                paddingRight: "15px",
                paddingTop: "0px",
                paddingBottom: "0px",
                background: headerColor,
                color: textColor,

                textAlign: "left",
              }}
            >
              Details
            </td>
            <td
              style={{
                opacity: "0.9",
                paddingLeft: "0px",
                paddingTop: "0px",
                paddingRight: "2px",
                paddingBottom: "0px",
                background: headerColor,
                color: textColor,

                textAlign: "right",
              }}
            >
              <a
                onClick={(e) => {
                  setFeatureInfoModeActivation(false);
                  console.log("selectedFeature", selectedFeature);

                  if (selectedFeature) {
                    console.log("setSelection", selectedFeature.setSelection);

                    selectedFeature.setSelection(false);
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
                style={{ color: textColor }}
              >
                <Icon name="close" />{" "}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <Well
        bsSize="small"
        style={{
          opacity: "0.9",
          paddingBottom: "0px",
        }}
      >
        <table style={{ width: "100%", paddingBottom: "0px" }}>
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
                {featureInfoValue !== undefined && (
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: 0,
                      textAlign: "center",
                    }}
                  >
                    {Math.round(featureInfoValue) + " MWh/Jahr"}
                    {/* {getRoundedValueStringForValue(featureInfoValue)} */}
                  </h2>
                )}
                {featureInfoValue === undefined && (
                  <p>
                    Klick in die Karte zur Abfrage der simulierten max.
                    Wassertiefe
                  </p>
                )}
              </td>
            </tr>
            {featureInfoValue !== undefined && (
              <tr>
                <td
                  style={{
                    opacity: "0.9",
                    paddingLeft: "0px",
                    paddingTop: "0px",
                    paddingBottom: "2px",
                    textAlign: "center",
                  }}
                >
                  <a
                    style={{ color: "#337ab7" }}
                    onClick={() => showModalMenu("aussagekraft")}
                  >
                    Information zur Aussagekraft
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Well>
    </div>
  );
};

export default Comp;
