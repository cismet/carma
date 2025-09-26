import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { LibMeasurements } from "@carma-commons/measurements";

suppressReactCismapErrors();

export function App() {
  return (
    <>
      <LibMeasurements />

      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        // infoBox={<GenericInfoBoxFromFeature />}
      ></TopicMapComponent>
    </>
  );
}

export default App;
