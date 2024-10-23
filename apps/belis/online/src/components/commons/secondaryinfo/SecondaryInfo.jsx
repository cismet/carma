import React, { useContext, useState } from "react";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { version as reactCismapVersion } from "react-cismap/meta";
import { useDispatch, useSelector } from "react-redux";

import { getBelisVersion } from "../../../constants/versions";
import { getJWT } from "../../../core/store/slices/auth";
import {
  getSelectedFeature,
  setSecondaryInfoVisible,
} from "../../../core/store/slices/featureCollection";
import getLayout4Arbeitsauftrag from "./components/Arbeitsauftrag";
import getLayout4Leuchte from "./components/Leuchte";
import getLayout4Mauerlasche from "./components/Mauerlasche";
import getLayout4Protokoll from "./components/Protokoll";
import getLayout4Schaltstelle from "./components/Schaltstelle";
import getLayout4Standort from "./components/Standort";
import SecondaryInfo from "./Secondary";
import SecondaryInfoPanelSection from "./SecondaryInfoPanelSection";
import VersionFooter from "./VersionFooter";

const InfoPanel = () => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  // const selectedFeature = leuchteMitAllenAttributen;
  return <InfoPanelComponent selectedFeature={selectedFeature} dispatch={dispatch} />;
};

export const InfoPanelComponent = ({ selectedFeature, dispatch }) => {
  const hit = JSON.parse(JSON.stringify(selectedFeature));
  const jwt = useSelector(getJWT);
  const [showRawData, setShowRawData] = useState(false);
  const { setIndex, setVisible } = useContext(LightBoxDispatchContext);
  const footer = (
    <div style={{ fontSize: "11px" }}>
      <div
        onClick={(e) => {
          if (e.detail === 2) {
            setShowRawData((old) => !old);
          }
        }}
      >
        <VersionFooter />
      </div>
    </div>
  );
  //remove geometry and feature reference
  try {
    delete hit.geometry;
    delete hit.properties.feature;
  } catch (e) {}
  const showRawDataFromUrl = new URLSearchParams(window.location.href).get("showRawData");

  if (hit) {
    const display = (desc, value, valFunc) => {
      if (value && valFunc === undefined && Array.isArray(value) === false) {
        return (
          <div>
            <b>{desc}:</b> {value}
          </div>
        );
      } else if (value && valFunc === undefined && Array.isArray(value) === true) {
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
    let rawDataDesc = "Rohdaten ";
    let subSections = [],
      mainSection = <div />,
      title = "Info";

    switch (hit.featuretype) {
      case "tdta_leuchten":
        ({ subSections, mainSection, title } = getLayout4Leuchte({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
        }));
        rawDataDesc += "der Leuchte";
        break;
      case "Leitung":
      case "leitung":
        rawDataDesc += "der Leitung";

        break;
      case "mauerlasche":
        ({ subSections, mainSection, title } = getLayout4Mauerlasche({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
        }));

        rawDataDesc += "der Mauerlasche";

        break;
      case "schaltstelle":
        rawDataDesc += "der Schaltstelle";
        ({ subSections, mainSection, title } = getLayout4Schaltstelle({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
        }));

        break;
      case "abzweigdose":
        rawDataDesc += "der Abzweigdose";

        break;
      case "tdta_standort_mast":
        ({ subSections, mainSection, title } = getLayout4Standort({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
        }));

        rawDataDesc += "des Masts/Standorts";

        break;
      case "arbeitsauftrag":
        ({ subSections, mainSection, title } = getLayout4Arbeitsauftrag({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
          showActions: true,
        }));

        rawDataDesc += "des Arbeitsauftrages";

        break;
      case "arbeitsprotokoll":
        ({ subSections, mainSection, title } = getLayout4Protokoll({
          feature: hit,
          jwt,
          dispatch,
          setIndex,
          setVisible,
          showActions: true,
        }));

        rawDataDesc += "des Protokolls";

        break;
      default:
        console.log("unbekannter featuretype: " + hit.featuretype);
    }

    if (showRawData || showRawDataFromUrl === "" || process.env.NODE_ENV !== "production") {
      //remove the geometries
      const hitForRawDisplay = JSON.parse(JSON.stringify(hit.properties));

      delete hitForRawDisplay.geojson;
      delete hitForRawDisplay.full_tdta_standort_mast;
      delete hitForRawDisplay.geometrie;
      delete hitForRawDisplay.fachobjekt;
      if (hitForRawDisplay.leitung) {
        delete hitForRawDisplay.leitung.geom;
      }
      if (hitForRawDisplay.mauerlasche) {
        delete hitForRawDisplay.mauerlasche.geom;
      }
      if (hitForRawDisplay.schaltstelle) {
        delete hitForRawDisplay.schaltstelle.geom;
      }
      if (hitForRawDisplay.abzweigdose) {
        delete hitForRawDisplay.abzweigdose.geom;
      }
      if (hitForRawDisplay.tdta_standort_mast) {
        delete hitForRawDisplay.tdta_standort_mast.geom;
      }

      for (const doc of hitForRawDisplay.docs || []) {
        if (doc.intermediate) {
          // set the url of the first 30 chars of the url to save memory
          doc.url = doc.url.substring(0, 30) + "...";
        }
      }

      subSections.push(
        <SecondaryInfoPanelSection
          key='standort'
          bsStyle='light'
          header={rawDataDesc}
          collapsedOnStart={true}
        >
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <pre key='hitObject'>{JSON.stringify(hitForRawDisplay, null, 2)}</pre>
            {/* <pre key='hits'>{JSON.stringify(hitsForRawDisplay, null, 2)}</pre> */}
          </div>
        </SecondaryInfoPanelSection>
      );
    }

    return (
      <SecondaryInfo
        visible={true}
        setVisibleState={(state) => {
          dispatch(setSecondaryInfoVisible(state));
        }}
        titleIconName='info-circle'
        title={title}
        mainSection={
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>{mainSection}</div>
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
