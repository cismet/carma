import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch, useSelector } from "react-redux";
import {
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  changeVisibility,
  getBackgroundLayer,
} from "../../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";

interface VisibilityToggleProps {
  visible: boolean;
  id: string;
  isBackgroundLayer?: boolean;
}

const VisibilityToggle = ({
  visible,
  id,
  isBackgroundLayer,
}: VisibilityToggleProps) => {
  const dispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedFeature = useSelector(getSelectedFeature);

  return (
    <button
      className="hover:text-gray-500 text-gray-600 flex items-center justify-center"
      onClick={(e) => {
        if (visible) {
          if (isBackgroundLayer) {
            dispatch(changeBackgroundVisibility(false));
          } else {
            dispatch(changeVisibility({ id, visible: false }));
            if (selectedFeature?.id === id) {
              dispatch(setSelectedFeature(null));
            }
          }
        } else {
          if (isBackgroundLayer) {
            dispatch(changeBackgroundVisibility(true));
            if (backgroundLayer.opacity === 0) {
              dispatch(changeBackgroundOpacity({ opacity: 1 }));
            }
          } else {
            dispatch(changeVisibility({ id, visible: true }));
          }
        }
      }}
    >
      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
    </button>
  );
};

export default VisibilityToggle;
