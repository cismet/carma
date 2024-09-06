import { SearchGazetteer } from "../../components/SearchGazetteer";
import { FC, useState } from "react";
import { useCesiumCustomViewer } from "../../CustomViewerContextProvider/components/CustomViewerContextProvider";

interface SearchWrapperProps {
}

const SearchWrapper: FC<SearchWrapperProps> = () => {
  const { viewer, models } = useCesiumCustomViewer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [hit, setHit] = useState<any | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSetOverlayFeature = (feature: any) => {
    // Replace 'any' with the actual type of the feature
    console.info("handleSetOverlayFeature is still to be implemented", feature);
  };
  return (
    viewer && <SearchGazetteer
      //gazData={[]}
      gazetteerHit={hit ?? undefined}
      setGazetteerHit={(hit) => {
        console.info("gazatteer on hit not implented", hit);
      }}
      cesiumRef={viewer}
      setOverlayFeature={handleSetOverlayFeature}
      //referenceSystem={null}
      //referenceSystemDefinition={null}
      pixelwidth={300}
      marker3dStyle={models ? models["MarkerFacingFixed"] : undefined}
      //overlayFeature={null}
    />
  );
};

export default SearchWrapper;
