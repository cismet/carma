import React, { useContext } from 'react';
import SearchGazetteer from '../../../lib/components/SearchGazetteer';
import { useCesium } from 'resium';

interface SearchWrapperProps {
  viewer?: any; // Replace 'any' with the actual type of the viewer
}

const SearchWrapper: React.FC<SearchWrapperProps> = ({ viewer }) => {
  const resiumCtx = useCesium();
  const ctx = viewer ?? resiumCtx.viewer;

  const handleSetOverlayFeature = (feature: any) => {
    // Replace 'any' with the actual type of the feature
    console.log('handleSetOverlayFeature', feature);
  };

  const handleSetGazetteerHit = (hit: any) => {
    console.log('handleSetGazetteerHit', hit);
  };

  return (
    <SearchGazetteer
      //gazData={[]}
      gazetteerHit={null}
      setGazetteerHit={handleSetGazetteerHit}
      setOverlayFeature={handleSetOverlayFeature}
      referenceSystem={null}
      referenceSystemDefinition={null}
      pixelwidth={300}
      overlayFeature={null}
    />
  );
};

export default SearchWrapper;
