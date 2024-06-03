import React from 'react';
import SearchGazetteer from '../../../lib/components/SearchGazetteer';
import { useCesium } from 'resium';
import { MODEL_ASSETS } from '../../../config/assets.config';

interface SearchWrapperProps {
  viewer?: any; // Replace 'any' with the actual type of the viewer
}

const SearchWrapper: React.FC<SearchWrapperProps> = ({ viewer }) => {
  const resiumCtx = useCesium();
  const ctx = viewer ?? resiumCtx.viewer;

  const [hit, setHit] = React.useState<any | null>(null);

  const handleSetOverlayFeature = (feature: any) => {
    // Replace 'any' with the actual type of the feature
    console.log('handleSetOverlayFeature', feature);
  };
  return (
    <SearchGazetteer
      //gazData={[]}
      gazetteerHit={hit ?? undefined}
      setGazetteerHit={(hit) => {
        console.log('gazatteer on hit', hit);
      }}
      cesiumRef={ctx}
      setOverlayFeature={handleSetOverlayFeature}
      //referenceSystem={null}
      //referenceSystemDefinition={null}
      pixelwidth={300}
      marker3dStyle={MODEL_ASSETS.MarkerFacingFixed}
      //overlayFeature={null}
    />
  );
};

export default SearchWrapper;
