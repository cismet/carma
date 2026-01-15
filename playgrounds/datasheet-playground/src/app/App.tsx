import { suppressReactCismapErrors } from "@carma-commons/utils";
import { Datasheet, useDatasheet } from "@carma-appframeworks/portals";
import { useRef, useEffect, useState, useContext } from "react";
import { CarmaMap } from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

suppressReactCismapErrors(true);

export function App() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { isDatasheetView, setIsDatasheetView, setMapSizes } = useDatasheet();
  const [feature, setFeature] = useState(null);

  // Set map sizes for position calculation when transitioning
  useEffect(() => {
    if (wrapperRef.current) {
      setMapSizes(
        {
          width: wrapperRef.current.clientWidth,
          height: wrapperRef.current.clientHeight,
        },
        { width: 300, height: 200 },
        16
      );
    }
  }, [
    wrapperRef.current?.clientWidth,
    wrapperRef.current?.clientHeight,
    setMapSizes,
  ]);

  return (
    <div style={{ width: "100%", height: "100vh" }} ref={wrapperRef}>
      <Datasheet
        mainComponent={
          <CarmaMap
            mapEngine="maplibre"
            zoomControls={!isDatasheetView}
            fullScreenControl={!isDatasheetView}
            locatorControl={!isDatasheetView}
            terrainControl={!isDatasheetView}
            libreLayers={[
              {
                name: "Grundschulen",
                type: "vector",
                style: "https://tiles.cismet.de/schulen/grundschule.style.json",
                infoboxMapping: [
                  "foto:p.foto",
                  "header:'Grundschule'",
                  "headerColor:p.farbe",
                  "title:p.name",
                  "additionalInfo:'Träger: ' + p.traeger + ', ' + p.adresse",
                  "subtitle:'OGS: ' + p.ogs + ', Betreuung: ' + p.gruppe + ', jahrgangsübergreifende Klassen: ' + p.jahrgang",
                  "url:p.homepage",
                  "tel:p.telefon",
                  "openDatasheet:true",
                ],
              },
            ]}
          />
        }
        datasheetComponent={
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <p style={{ fontSize: 24 }}>Hier könnte alles stehen</p>
          </div>
        }
      />
    </div>
  );
}
