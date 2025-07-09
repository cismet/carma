import L from "leaflet";
import { FeatureCollectionDisplay } from "react-cismap";

import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css";

interface BelisFeatureCollectionProps {
  featureCollection: any;
  fgColor: string;
  selectedFeature: any;
  handleSelectedFeature: (f: any) => void;
}

const DEBUGGING = false;
export const BelisFeatureCollection = ({
  featureCollection,
  fgColor = "#000000",
  selectedFeature,
  handleSelectedFeature,
}: BelisFeatureCollectionProps) => {
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
            handleSelectedFeature(feature);
          }, 10);
        }}
        clusteringEnabled={false}
        style={(feature) => {
          const derivedFeatureType =
            feature.fachobjekttype || feature.featuretype;
          let customMarker;
          let color = colors[derivedFeatureType] || fgColor;
          if (feature.featuretype === "arbeitsprotokoll") {
            if (feature.properties.arbeitsprotokollstatus) {
              if (
                feature.properties.arbeitsprotokollstatus.schluessel === "0"
              ) {
                color = "#fdad00";
              } else if (
                feature.properties.arbeitsprotokollstatus.schluessel === "1"
              ) {
                color = "#a7ca27";
              } else if (
                feature.properties.arbeitsprotokollstatus.schluessel === "2"
              ) {
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
        showMarkerCollection={false}
      />
    </div>
  );
};
