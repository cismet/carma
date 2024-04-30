import { notification } from "antd";
import { useContext, useEffect, useRef, useState } from "react";
import ProjGeoJson from "react-cismap/ProjGeoJson";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

export default function NotesDisplay({ hinweisData }) {
  const { routedMapRef } = useContext(TopicMapContext);
  const mapRef = routedMapRef?.leafletMap?.leafletElement;
  const currentZoom = mapRef?.getZoom();
  const [hinweisShown, setHinweisShown] = useState(false);
  const hinweisShownRef = useRef(hinweisShown);
  useEffect(() => {
    hinweisShownRef.current = hinweisShown;
  }, [hinweisShown]);
  return (
    currentZoom >= 18 && (
      <ProjGeoJson
        featureClickHandler={(e) => {
          // e.originalEvent.stopImmediatePropagation();
          if (hinweisShownRef.current === false) {
            console.log("e.target.feature.properties", e);

            notification.info({
              style: { width: 430, marginTop: 30, marginRight: -13 },
              duration: 15,
              message: (
                <span>
                  <b>{e.target.feature.properties.titel}</b> -{" "}
                  {e.target.feature.properties.kategorie}
                </span>
              ),
              description: e.target.feature.properties.beschreibung,

              placement: "topRight",
              onClose: () => {
                setHinweisShown(false);
              },
            });
            setHinweisShown(true);
          }
        }}
        hoverer={(feature) => {
          return (
            feature.properties.kategorie +
            "<br/>Klicken Sie für mehr Informationen"
          );
        }}
        key={hinweisData.length + "gewaesser"}
        style={(feature) => {
          return {
            fillColor: "#525C55",
            fillOpacity: 0.7,
            weight: 0,
          };
        }}
        opacity={1}
        featureCollection={hinweisData}
      />
    )
  );
}
