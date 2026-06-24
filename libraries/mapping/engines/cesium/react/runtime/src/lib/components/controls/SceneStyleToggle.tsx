import { MouseEvent, ReactNode } from "react";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useCesiumContext } from "../../hooks/useCesiumContext";
import { SceneStyles } from "../../..";
type SceneStyleToggleProps = {
  children?: ReactNode;
  defaultStyle?: keyof SceneStyles;
  onToggle?: (isFirstStyle: boolean) => void;
};

export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { currentSceneStyle, sceneStyleIds, toggleCurrentSceneStyle } =
    useCesiumContext();
  const isFirstStyle = currentSceneStyle === sceneStyleIds[0];
  const { onToggle } = props;
  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    toggleCurrentSceneStyle();
    onToggle?.(isFirstStyle);
  };

  return (
    <ControlButtonStyler
      title={
        isFirstStyle
          ? "Wechsel zur vereinfachten Ansicht"
          : "Wechsel zur realistischen Ansicht"
      }
      onClick={handleToggle}
    >
      <FontAwesomeIcon
        icon={isFirstStyle ? faCubes : faTreeCity}
      ></FontAwesomeIcon>
    </ControlButtonStyler>
  );
};

export default SceneStyleToggle;
