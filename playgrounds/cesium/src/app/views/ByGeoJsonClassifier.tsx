import { useSelector } from "react-redux";

import {
  ByGeojsonClassifier,
  selectViewerDataSources,
} from "../../lib/cesium-engine-snapshot/src";

function View() {
  const { footprintGeoJson } = useSelector(selectViewerDataSources);

  return footprintGeoJson && <ByGeojsonClassifier geojson={footprintGeoJson} />;
}

export default View;
