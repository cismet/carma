import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  createInteractionToolPlugin,
  INTERACTION_PLUGIN_CAPABILITIES,
} from "@carma-mapping/annotations/runtime";

const toolId = "select";

export const selectToolPlugin = createInteractionToolPlugin({
  id: toolId,
  annotationType: null,
  descriptor: {
    id: toolId,
    order: 10,
    label: "Auswahl",
    tooltip: "Messungen auswählen",
    shortcutKey: "S",
    icon: <FontAwesomeIcon icon={faArrowPointer} />,
  },
  helpText: [
    "Messungen oder Anmerkungen anklicken, um sie auszuwählen.",
    "Langes Drücken auf einen Punkt öffnet den Editiermodus.",
  ],
  capabilities: INTERACTION_PLUGIN_CAPABILITIES,
  session: {
    createSession: ({ setActiveToolType }) => ({
      toolType: toolId,
      requestStart: () => {
        setActiveToolType(toolId);
      },
      requestFinish: () => false,
      discardDraft: () => undefined,
    }),
  },
});
