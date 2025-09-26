import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";

suppressReactCismapErrors();

export function App() {
  return (
    <>
      <TopicMapComponent
        gazetteerSearchComponent={<></>}
        // infoBox={<GenericInfoBoxFromFeature />}
      ></TopicMapComponent>
    </>
  );
}

export default App;
