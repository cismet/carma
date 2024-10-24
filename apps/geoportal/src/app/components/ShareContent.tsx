import { Share } from "@carma-apps/portals";
import { getLayerState } from "../store/slices/mapping";
import { useSelector } from "react-redux";

export const ShareContent = () => {
  const layerState = useSelector(getLayerState);
  console.debug("RENDER: ShareContent");
  return <Share layerState={layerState} />;
};

export default ShareContent;
