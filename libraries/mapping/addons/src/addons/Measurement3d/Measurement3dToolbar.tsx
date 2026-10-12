import { createPortal } from "react-dom";
import {
  DevelopmentOnlyUiBackdrop,
  type DevelopmentOnlyUiBackdropStyleOptions,
} from "@carma-commons/ui/components";
import {
  RuntimeAnnotationsToolbar,
  type AnnotationToolPlugin,
  type AnnotationsToolbarClassNames,
} from "@carma-mapping/annotations/runtime";
import {
  STABLE_ANNOTATION_TOOL_IDS,
  type AnnotationToolbarTool,
} from "@carma-mapping/annotations/ui";
import { useMeasurement3dPanelHost } from "./measurement3d-panel-host";

const STABLE_TOOL_ID_SET = new Set<string>(STABLE_ANNOTATION_TOOL_IDS);

/** The geoportal layer-bar look of the tool buttons. */
const TOOLBAR_CLASS_NAMES = {
  toolButtonBase:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors [&_svg]:text-current",
  toolButtonActive: "!text-[#1677ff] hover:!text-[#1677ff] !shadow-none",
  toolButtonInactive: "text-gray-600 hover:!text-gray-500 button-shadow",
  toolButtonIcon:
    "inline-flex items-center justify-center text-base leading-none [&_svg]:text-current",
} satisfies Partial<AnnotationsToolbarClassNames>;

const DEVELOPMENT_PREVIEW_PATTERN_OPTIONS = {
  backgroundColor: "transparent",
  primaryColor: "rgba(0, 0, 0, 0.1)",
  rotationDeg: 45,
  secondaryColor: "transparent",
  stripeGapPx: 5,
  stripeWidthPx: 5,
  textVisible: false,
} satisfies DevelopmentOnlyUiBackdropStyleOptions;

const renderToolButtonBackdrop = (tool: AnnotationToolbarTool) =>
  STABLE_TOOL_ID_SET.has(tool.id) ? null : (
    <DevelopmentOnlyUiBackdrop
      patternOptions={DEVELOPMENT_PREVIEW_PATTERN_OPTIONS}
    />
  );

/** The toolbar, portalled into the ribbon the host renders for the row. */
export const Measurement3dToolbarPortal = ({
  plugins,
}: {
  plugins: readonly AnnotationToolPlugin[];
}) => {
  const host = useMeasurement3dPanelHost();
  if (!host) return null;
  return createPortal(
    <div className="flex items-center gap-2">
      <RuntimeAnnotationsToolbar
        plugins={plugins}
        classNames={TOOLBAR_CLASS_NAMES}
        disableSelectWithoutAnnotations
        tooltipPlacement="bottom"
        renderToolButtonBackdrop={renderToolButtonBackdrop}
      />
    </div>,
    host
  );
};
