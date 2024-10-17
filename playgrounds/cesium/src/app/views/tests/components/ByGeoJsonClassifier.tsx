import { useSelector } from 'react-redux';

import { ByGeojsonClassifier, selectViewerDataSources } from '@carma-mapping/cesium-engine';

function View() {
  const { footprintGeoJson } = useSelector(selectViewerDataSources);

  return (
    footprintGeoJson && <ByGeojsonClassifier geojson={footprintGeoJson} debug />
  );
}

export default View;
