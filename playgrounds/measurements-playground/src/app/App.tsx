import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { LibMeasurements } from "@carma-commons/measurements";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "@carma-mapping/components";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";

suppressReactCismapErrors();

export function App() {
  const [startDrawing, setStartDrawing] = useState(false);
  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="topleft" order={10}>
          <ControlButtonStyler
            onClick={() => {
              setStartDrawing(!startDrawing);
            }}
          >
            <FontAwesomeIcon
              icon={faRuler}
              style={{ color: startDrawing ? "blue" : "black" }}
            />
          </ControlButtonStyler>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
      >
        <LibMeasurements startDrawing={startDrawing} />
      </TopicMapComponent>
    </>
  );
}

export default App;
