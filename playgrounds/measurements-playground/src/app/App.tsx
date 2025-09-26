import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { LibMeasurements } from "@carma-commons/measurements";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "@carma-mapping/components";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRuler } from "@fortawesome/free-solid-svg-icons";

suppressReactCismapErrors();

export function App() {
  return (
    <>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="topleft" order={10}>
          <ControlButtonStyler
            onClick={() => {
              console.log("xxx measurements");
            }}
          >
            <FontAwesomeIcon icon={faRuler} />
          </ControlButtonStyler>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
      >
        <LibMeasurements />
      </TopicMapComponent>
    </>
  );
}

export default App;
