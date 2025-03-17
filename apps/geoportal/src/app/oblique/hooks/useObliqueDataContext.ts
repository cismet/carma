import { useContext } from "react";
import { ObliqueDataContext } from "../components/ObliqueDataContext";

// Custom hook to use the oblique data context
export const useObliqueDataContext = () => {
  const context = useContext(ObliqueDataContext);
  if (!context) {
    throw new Error(
      "useObliqueDataContext must be used within an ObliqueDataProvider"
    );
  }
  return context;
};
