import { MouseEvent, ReactNode } from "react";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useCesiumContext } from "../../context/hooks/use-cesium-context";

type SceneStyleToggleProps = {
  children?: ReactNode;
  onToggle?: (isAerial: boolean) => void;
};
export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { currentSceneStyleRef, sceneStyleApplierRef } = useCesiumContext();
  const currentSceneStyle = currentSceneStyleRef.current;
  const isAerialStyle = currentSceneStyle === "aerial";
  const { onToggle } = props;

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    // Direct style toggle - no event system needed
    const newStyle = isAerialStyle ? "lod2" : "aerial";
    console.log("[SceneStyleToggle] Toggling style to:", newStyle);
    sceneStyleApplierRef.current?.(newStyle);
    onToggle?.(isAerialStyle);
  };

  return (
    <ControlButtonStyler
      title={
        isAerialStyle
          ? "Wechsel zur vereinfachten Ansicht"
          : "Wechsel zur realistischen Ansicht"
      }
      onClick={handleToggle}
    >
      <FontAwesomeIcon
        icon={isAerialStyle ? faTreeCity : faCubes}
      ></FontAwesomeIcon>
    </ControlButtonStyler>
  );
};

export default SceneStyleToggle;
