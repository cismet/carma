import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
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
    id: ANNOTATION_TYPES.SELECT,
    annotationType: null,
    descriptor: {
      id: ANNOTATION_TYPES.SELECT,
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
        toolType: ANNOTATION_TYPES.SELECT,
        requestStart: () => {
          setActiveToolType(ANNOTATION_TYPES.SELECT);
        },
        requestFinish: () => false,
        discardDraft: () => undefined,
      }),
    },
  });
};

export const selectToolPlugin = createSelectToolPlugin();
