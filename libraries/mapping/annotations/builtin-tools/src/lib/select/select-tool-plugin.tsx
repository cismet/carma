import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import {
  createInteractionToolPlugin,
  INTERACTION_PLUGIN_CAPABILITIES,
} from "@carma-mapping/annotations/runtime";
import type { DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";

export type SelectToolPluginOptions = {
  texts?: DefaultAnnotationToolTexts;
};

export const createSelectToolPlugin = ({
  texts = defaultAnnotationToolTexts,
}: SelectToolPluginOptions = {}) => {
  const text = texts.select;

  return createInteractionToolPlugin({
    id: ANNOTATION_SELECT_TOOL_ID,
    annotationType: null,
    descriptor: {
      id: ANNOTATION_SELECT_TOOL_ID,
      order: 10,
      label: text.label,
      tooltip: text.tooltip,
      shortcutKey: "S",
      icon: <FontAwesomeIcon icon={faArrowPointer} />,
    },
    helpText: text.helpText,
    capabilities: INTERACTION_PLUGIN_CAPABILITIES,
    session: {
      createSession: ({ setActiveToolType }) => ({
        toolType: ANNOTATION_SELECT_TOOL_ID,
        requestStart: () => {
          setActiveToolType(ANNOTATION_SELECT_TOOL_ID);
        },
        requestFinish: () => false,
        discardDraft: () => undefined,
      }),
    },
  });
};

export const selectToolPlugin = createSelectToolPlugin();
