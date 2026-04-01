import { useSelector } from "react-redux";

import {
  ByGeojsonClassifier,
  selectViewerDataSources,
} from "@carma-mapping/engines/cesium/legacy";

function View() {
  const dataSources = useSelector(selectViewerDataSources);

  if (!dataSources) return null;

  const footprintGeoJson = dataSources.footprintGeoJson;

  return footprintGeoJson && <ByGeojsonClassifier geojson={footprintGeoJson} />;
}

export default View;
