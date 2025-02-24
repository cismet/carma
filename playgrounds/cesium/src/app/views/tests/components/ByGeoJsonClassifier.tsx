import { useSelector } from "react-redux";

import {
  ByGeojsonClassifier,
  selectViewerDataSources,
} from "@carma-mapping/cesium-engine";

function View() {
  const datasources = useSelector(selectViewerDataSources);

  if (!datasources) return null;

  const footprintGeoJson = datasources.footprintGeoJson;

  return (
    footprintGeoJson && <ByGeojsonClassifier geojson={footprintGeoJson} debug />
  );
}

export default View;
