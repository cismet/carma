import { Share, useSelection } from "@carma-appframeworks/portals";
import { useAuth } from "@carma-providers/auth";
import { loadAnnotationsRuntimeGeoJsonFeatureCollection } from "@carma-mapping/annotations/runtime";
import { GEOPORTAL_ANNOTATIONS_STORAGE_KEY } from "../config/app.config";

import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";
import { apiUrl } from "../constants/discover";
import { getSelectedFeature } from "../store/slices/features";

interface ShareContentProps {
  closePopover?: () => void;
}

export const ShareContent = ({ closePopover }: ShareContentProps) => {
  const layerState = useSelector(getLayerState);
  const selectedFeature = useSelector(getSelectedFeature);
  const { jwt, userGroups } = useAuth();
  const { selection } = useSelection();
  const allowPublishing = userGroups.includes("_Geoportal_Publizieren");
  // The measurements travel with the configuration: the stored set of both views.
  const measurements3d = loadAnnotationsRuntimeGeoJsonFeatureCollection(
    GEOPORTAL_ANNOTATIONS_STORAGE_KEY
  );
  console.debug("RENDER: ShareContent");
  return (
    <Share
      extraConfig={measurements3d ? { measurements3d } : undefined}
      layerState={layerState}
      closePopover={closePopover}
      selection={selection}
      showExtendedSharing={!!jwt && allowPublishing}
      jwt={jwt}
      apiUrl={apiUrl}
      selectedFeature={selectedFeature}
    />
  );
};

export default ShareContent;
