import { MouseEvent, ReactNode } from "react";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { SceneStyles } from "../../..";
import { SCENE_STYLES } from "../../constants";
import { useCesiumContext } from "../../hooks/useCesiumContext";
import { CtxEvent } from "../../cesiumContextEventMap";

type SceneStyleToggleProps = {
  children?: ReactNode;
  defaultStyle?: keyof SceneStyles;
  onToggle?: (isToPrimary: boolean) => void;
};
export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { emit, currentSceneStyleRef } = useCesiumContext();
  const currentSceneStyle = currentSceneStyleRef.current;
  const isPrimaryStyle = currentSceneStyle === SCENE_STYLES.PRIMARY;
  const { onToggle } = props;

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    emit(CtxEvent.ToggleSceneStyle, undefined);
    onToggle?.(isPrimaryStyle);
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
