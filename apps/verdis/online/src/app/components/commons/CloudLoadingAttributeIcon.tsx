import IconForAttribute from "./IconForAttribute";
import {
  faCloudUploadAlt,
  faCloudDownloadAlt,
  faCloudRain,
} from "@fortawesome/free-solid-svg-icons";
import { useSelector } from "react-redux";
import { getUiState } from "../../../store/slices/ui";

const Comp = ({ value }) => {
  const iconAttributeMap = {};
  const uiState = useSelector(getUiState);
  iconAttributeMap[uiState.CLOUDSTORAGESTATES.CLOUD_STORAGE_DOWN] =
    faCloudDownloadAlt;
  iconAttributeMap[uiState.CLOUDSTORAGESTATES.CLOUD_STORAGE_UP] =
    faCloudUploadAlt;
  iconAttributeMap[uiState.CLOUDSTORAGESTATES.CLOUD_STORAGE_ERROR] =
    faCloudRain;
  return <IconForAttribute iconAttributeMap={iconAttributeMap} value={value} />;
};
export default Comp;
