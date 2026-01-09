import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { Datasheet, useDatasheet } from "@carma-mapping/components";
import { useRef, useEffect, useState } from "react";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { FeatureInfobox, InfoBox } from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";

suppressReactCismapErrors(true);

export function App() {
  const wrapperRef = useRef<HTMLDivElement>(null);
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
      <ControlLayout>
        {!isDatasheetView && (
          <Control position="bottomright" order={10}>
            <FeatureInfobox
              selectedFeature={feature}
              versionData={{
                version: "0.1",
              }}
            />
          </Control>
        )}
      </ControlLayout>
      <Datasheet
        mainComponent={
          <TopicMapComponent
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            hamburgerMenu={false}
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            leafletMapProps={{ editable: true }}
            mapStyle={{
              width: isDatasheetView ? 300 : wrapperRef.current?.clientWidth,
              height: isDatasheetView ? 200 : wrapperRef.current?.clientHeight,
            }}
          >
            <CismapLayer
              type="vector"
              style="https://tiles.cismet.de/belis/style.json"
              selectionEnabled={true}
              manualSelectionManagement={true}
              maxSelectionCount={10}
              additionalLayerUniquePane={"vector." + 0}
              additionalLayersFreeZOrder={0}
              onSelectionChanged={(e) => {
                if (e.hit && e.hit.setSelection) {
                  if (
                    e.hit.properties.fabrikat ||
                    e.hit.properties.bezeichnung ||
                    e.hit.properties.strasse
                  ) {
                    e.hit.setSelection(true);
                    setFeature({
                      properties: {
                        header: "Lampen",
                        title:
                          e.hit.properties.fabrikat ||
                          e.hit.properties.bezeichnung ||
                          e.hit.properties.strasse,
                        genericLinks: [
                          {
                            tooltip: "Datenblatt",
                            action: () => {
                              setIsDatasheetView(true);
                            },
                            iconname: "file",
                          },
                        ],
                      },
                    });
                  }
                } else {
                  setFeature(null);
                }
              }}
            />
          </TopicMapComponent>
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
