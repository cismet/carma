import { Share, useSelection } from "@carma-apps/portals";
import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";

interface ShareContentProps {
  closePopover?: () => void;
}

export const ShareContent = ({ closePopover }: ShareContentProps) => {
  const layerState = useSelector(getLayerState);
  const jwt = useSelector(getJWT);
  const { selection } = useSelection();
  console.debug("RENDER: ShareContent");
  return (
    <Share
      layerState={layerState}
      closePopover={closePopover}
      selection={selection}
      showExtendedSharing={!!jwt}
      jwt={jwt}
    />
  );
};

export default ShareContent;
