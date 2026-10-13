import { useAnnotationLabelTextDialogState } from "@carma-mapping/annotations/runtime";
import { AnnotationLabelTextModal as LabelTextModal } from "@carma-mapping/annotations/ui";

import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";

export const AnnotationLabelTextModal = () => {
  const dialog = useAnnotationLabelTextDialogState();
  return (
    <LabelTextModal
      {...dialog}
      texts={geoportalAnnotationModeText.labelTextModal}
    />
  );
};

export default AnnotationLabelTextModal;
