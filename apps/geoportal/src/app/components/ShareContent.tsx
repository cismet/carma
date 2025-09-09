import { Share, useSelection } from "@carma-appframeworks/portals";
import { useAuth } from "@carma-providers/auth";

import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";
import { apiUrl } from "../constants/discover";

interface ShareContentProps {
  closePopover?: () => void;
}

export const ShareContent = ({ closePopover }: ShareContentProps) => {
  const layerState = useSelector(getLayerState);
  const { jwt, userGroups } = useAuth();
  const { selection } = useSelection();
  const allowPublishing = userGroups.includes("_Geoportal_Publizieren");
  console.debug("RENDER: ShareContent");
  return (
    <Share
      layerState={layerState}
      closePopover={closePopover}
      selection={selection}
      showExtendedSharing={!!jwt && allowPublishing}
      jwt={jwt}
      apiUrl={apiUrl}
    />
  );
};

export default ShareContent;
