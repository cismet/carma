import { Share, useSelection } from "@carma-apps/portals";
import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";
import { getShareShiftClicked } from "../store/slices/ui";

interface ShareContentProps {
  closePopover?: () => void;
}

export const ShareContent = ({ closePopover }: ShareContentProps) => {
  const layerState = useSelector(getLayerState);
  const shareShiftClicked = useSelector(getShareShiftClicked);
  const { selection } = useSelection();
  console.debug("RENDER: ShareContent");
  return (
    <Share
      layerState={layerState}
      closePopover={closePopover}
      selection={selection}
      forceClick={shareShiftClicked}
    />
  );
};

export default ShareContent;
