import LeitungForm from "./LeitungForm";
import LeuchteForm from "./LeuchteForm";
import FeaturesFormsWrapper from "./FeaturesFormsWrapper";

export { LeitungForm, LeuchteForm, FeaturesFormsWrapper };

export const featureFormRegistry: Record<string, React.ComponentType<any>> = {
  leitung: LeitungForm,
  leuchte: LeuchteForm,
};
