import { Share, useAuth, useSelection } from "@carma-apps/portals";
import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";

interface ShareContentProps {
  closePopover?: () => void;
}

export const ShareContent = ({ closePopover }: ShareContentProps) => {
  const layerState = useSelector(getLayerState);
  const { jwt } = useAuth();
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
