import type { AnnotationsToolbarClassNames } from "@carma-mapping/annotations/runtime";

export const GEOPORTAL_LAYER_TOOL_ACTION_BUTTON_CLASS_NAMES = {
  base: "px-1.5 flex items-center justify-center text-sm [&_svg]:text-current",
  active: "!text-[#1677ff] hover:!text-[#1677ff] !shadow-none",
  inactive: "text-gray-600 hover:!text-gray-500",
} as const;

export const GEOPORTAL_LAYER_TOOL_ACTION_TOOLBAR_CLASS_NAMES = {
  toolButtonBase:
    "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 transition-colors [&_svg]:text-current",
  toolButtonActive: GEOPORTAL_LAYER_TOOL_ACTION_BUTTON_CLASS_NAMES.active,
  toolButtonInactive: `${GEOPORTAL_LAYER_TOOL_ACTION_BUTTON_CLASS_NAMES.inactive} button-shadow`,
  toolButtonIcon:
    "inline-flex items-center justify-center text-base leading-none [&_svg]:text-current",
} satisfies Partial<AnnotationsToolbarClassNames>;
