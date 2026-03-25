import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createInteractionToolPlugin,
  INTERACTION_PLUGIN_CAPABILITIES,
} from "../pluginFactories";

const toolType = SELECT_TOOL_TYPE;

export const selectToolPlugin = createInteractionToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 10,
    label: "Auswahl",
    tooltip: "Auswahlmodus",
    icon: <FontAwesomeIcon icon={faArrowPointer} />,
  },
  helpText: [
    "Objekte anklicken, um sie auszuwaehlen.",
    "Mit Mehrfachauswahl koennen mehrere Annotationen gemeinsam bearbeitet werden.",
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
