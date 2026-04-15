import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type AnnotationToolType,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import {
  createInteractionToolPlugin,
  INTERACTION_PLUGIN_CAPABILITIES,
} from "../plugin-factories";
const { SELECT: SELECT_TOOL_TYPE } = ANNOTATION_TOOL_TYPES;

const toolType = SELECT_TOOL_TYPE;

export const selectToolPlugin = createInteractionToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 10,
    label: "Auswahl",
    tooltip: "Messungen auswählen",
    icon: <FontAwesomeIcon icon={faArrowPointer} />,
  },
  helpText: [
    "Messungen oder Anmerkungen anklicken, um sie auszuwählen.",
    "Langes Drücken auf einen Punkt öffnet den Editiermodus.",
  ],
  capabilities: INTERACTION_PLUGIN_CAPABILITIES,
  session: {
    createSession: ({ setActiveToolType }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => false,
      discardDraft: () => undefined,
    }),
  },
});
