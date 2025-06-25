import { MouseEvent, ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { SceneStyles } from "../../..";
import {
  selectCurrentSceneStyle,
  toggleCurrentSceneStyle,
} from "../../slices/cesium";

type SceneStyleToggleProps = {
  children?: ReactNode;
  defaultStyle?: keyof SceneStyles;
  onToggle?: (isToPrimary: boolean) => void;
};

export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const dispatch = useDispatch();
  const currentSceneStyle = useSelector(selectCurrentSceneStyle);
  const isPrimaryStyle = currentSceneStyle === "primary";
  const { onToggle } = props;
  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    dispatch(toggleCurrentSceneStyle());
    onToggle && onToggle(isPrimaryStyle);
  };

  return (
    <ControlButtonStyler
      title={
        isPrimaryStyle
          ? "Wechsel zur vereinfachten Ansicht"
          : "Wechsel zur realistischen Ansicht"
      }
      onClick={handleToggle}
    >
      <FontAwesomeIcon
        icon={isPrimaryStyle ? faCubes : faTreeCity}
      ></FontAwesomeIcon>
    </ControlButtonStyler>
  );
};

export default SceneStyleToggle;
