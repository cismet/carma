import IconForAttribute from "./IconForAttribute";
import {
  faCloudUploadAlt,
  faCloudDownloadAlt,
  faCloudRain,
} from "@fortawesome/free-solid-svg-icons";
import { useSelector } from "react-redux";
import { CLOUDSTORAGESTATES } from "../../../store/slices/ui";

const iconAttributeMap = {};

iconAttributeMap[CLOUDSTORAGESTATES.CLOUD_STORAGE_DOWN] = faCloudDownloadAlt;
iconAttributeMap[CLOUDSTORAGESTATES.CLOUD_STORAGE_UP] = faCloudUploadAlt;
iconAttributeMap[CLOUDSTORAGESTATES.CLOUD_STORAGE_ERROR] = faCloudRain;

const Comp = ({ value }) => {
  return <IconForAttribute iconAttributeMap={iconAttributeMap} value={value} />;
};
export default Comp;
