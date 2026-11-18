import { useDispatch } from "react-redux";

import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";

import { setUIMode, UIMode } from "../../store/slices/ui";
import { SaveAnnotationsPanel } from "./SaveAnnotationsPanel";

function SaveCesiumAnnotations() {
  const dispatch = useDispatch();
  const runtime = useAnnotationsRuntime();
  return (
    <SaveAnnotationsPanel
      source={runtime}
      onSaved={() => dispatch(setUIMode(UIMode.DEFAULT))}
    />
  );
}

export default SaveCesiumAnnotations;
