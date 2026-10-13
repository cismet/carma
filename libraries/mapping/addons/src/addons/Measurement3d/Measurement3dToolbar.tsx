import { createPortal } from "react-dom";
import {
  RuntimeAnnotationsToolbar,
  type AnnotationToolPlugin,
} from "@carma-mapping/annotations/runtime";
import {
  useMeasurement3dHostUi,
  useMeasurement3dPanelHost,
} from "./measurement3d-host";

/** The toolbar, portalled into the ribbon the host renders for the row. */
export const Measurement3dToolbarPortal = ({
  plugins,
}: {
  plugins: readonly AnnotationToolPlugin[];
}) => {
  const host = useMeasurement3dPanelHost();
  const toolbar = useMeasurement3dHostUi()?.toolbar;
  if (!host) return null;
  return createPortal(
    <div className="flex items-center gap-2">
      <RuntimeAnnotationsToolbar
        plugins={plugins}
        classNames={toolbar?.classNames}
        renderToolButtonBackdrop={toolbar?.renderToolButtonBackdrop}
        disableSelectWithoutAnnotations
        tooltipPlacement="bottom"
      />
    </div>,
    host
  );
};
