import L from "leaflet";
import React from "react";
import { FeatureCollectionDisplay } from "react-cismap";
import { useDispatch, useSelector } from "react-redux";

import { getBackground } from "../../core/store/slices/background";
import { getSelectedFeature, setSelectedFeature } from "../../core/store/slices/featureCollection";

import "@fortawesome/fontawesome-free/js/all.js";
import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css";

const DEBUGGING = false;
const BelisFeatureCollection = ({ featureCollection, fgColor = "#000000" }) => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const background = useSelector(getBackground);
  let modeClass = "brightMode";
  const colors = {
    arbeitsauftrag: "#c44d59",
    leitung: "#D3976C",
    geom: "#ABF8D0",
  };

  const backgroundcolors = {
    arbeitsauftrag: "#ff6b6b",
    geom: "#FFFFE7",
  };

  // if (background === "nightplan") {
  //   modeClass = "darkMode";
  // }

  return (
    <div>
      {DEBUGGING && (
        <FeatureCollectionDisplay
          key={"FCD.selectedFeature" + selectedFeature?.id}
          featureCollection={featureCollection}
          clusteringEnabled={false}
          style={(feature) => {
            return {
              radius: 5,
              fillColor: "red",
              color: "blue",
              opacity: 1,
              fillOpacity: 0.8,
            };
          }}
          showMarkerCollection={false}
        />
      )}
      <FeatureCollectionDisplay
        key={"FCD.selectedFeature" + selectedFeature?.id}
        featureCollection={featureCollection}
        featureClickHandler={(event, feature) => {
          setTimeout(() => {
            dispatch(setSelectedFeature(feature));
          }, 10);
        }}
        clusteringEnabled={false}
        style={(feature) => {
          const derivedFeatureType = feature.fachobjekttype || feature.featuretype;
          let customMarker;
          let color = colors[derivedFeatureType] || fgColor;
          if (feature.featuretype === "arbeitsprotokoll") {
            if (feature.properties.arbeitsprotokollstatus) {
              if (feature.properties.arbeitsprotokollstatus.schluessel === "0") {
                color = "#fdad00";
              } else if (feature.properties.arbeitsprotokollstatus.schluessel === "1") {
                color = "#a7ca27";
              } else if (feature.properties.arbeitsprotokollstatus.schluessel === "2") {
                color = "#f74545";
              }
            }
          }

          if (derivedFeatureType !== "leitung") {
            let divContent = `<div style="color:${color}" class="${modeClass} belisiconclass_${derivedFeatureType}">
                                <div style="color:${color}" class="${modeClass} belisiconclass_${derivedFeatureType}_inner"></div>
                              </div>`;
            if (feature.selected === true) {
              divContent = `<div class="${modeClass} selectedfeature">${divContent}</div>`;
            }
            customMarker = L.divIcon({
              className: "belis-custom-marker",
              html: divContent,
              iconAnchor: [14, 14],
              iconSize: [28, 28],
            });
          }

          return {
            radius: 14,
            fillColor: backgroundcolors[derivedFeatureType] || "tomato",
            color: feature.selected === true ? "#7AA8F6" : color,
            opacity: 1,
            weight: 4,
            fillOpacity: 0.8,

            customMarker,
          };
        }}
        //mapRef={topicMapRef} // commented out because there cannot be a ref in a functional comp and it is bnot needed
        showMarkerCollection={false}
      />
    </div>
  );
};
export default BelisFeatureCollection;
