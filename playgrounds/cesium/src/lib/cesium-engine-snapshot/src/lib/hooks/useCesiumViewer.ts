import { useCesiumContext } from "./useCesiumContext";

export const useCesiumViewer = () => {
  const { viewerRef } = useCesiumContext();
  return viewerRef.current;
};
