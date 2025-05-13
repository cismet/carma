import { useContext } from "react";
import { ObliqueContext } from "../components/ObliqueProvider";

// Custom hook to use the oblique data context
export const useOblique = () => {
  const context = useContext(ObliqueContext);
  if (!context) {
    throw new Error(
      "useOblique must be used within an ObliqueProvider to access the context"
    );
  }
  return context;
};
