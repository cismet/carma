import LeitungForm from "./LeitungForm";
import LeuchteForm from "./LeuchteForm";

export { LeitungForm, LeuchteForm };

export const featureFormRegistry: Record<string, React.ComponentType<any>> = {
  leitung: LeitungForm,
  leuchte: LeuchteForm,
};
