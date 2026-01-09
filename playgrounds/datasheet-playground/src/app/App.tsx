import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { Datasheet, useDatasheet } from "@carma-mapping/components";
import { useRef, useEffect } from "react";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { InfoBox } from "@carma-appframeworks/portals";

suppressReactCismapErrors(true);

export function App() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { isDatasheetView, setIsDatasheetView, setMapSizes } = useDatasheet();

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
      {/* <ControlLayout>
        {!isDatasheetView && (
          <Control position="bottomright" order={10}>
            <InfoBox
              pixelwidth={200}
              header="InfoBox"
              headerColor="grey"
              noCurrentFeatureContent={
                <button onClick={() => setIsDatasheetView(true)}>
                  Datenblatt anzeigen
                </button>
              }
            />
          </Control>
        )}
      </ControlLayout> */}
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
