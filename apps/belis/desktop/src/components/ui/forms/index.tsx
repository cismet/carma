import { ComponentType } from "react";
import { FormInstance } from "antd";
import MasttypForm from "./MasttypForm";
import LeuchentypForm from "./LeuchentypForm";
import RundsteuerempfaengerForm from "./RundsteuerempfaengerForm";

export interface CustomFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
}

// Registry keyed by form name (referenced in keyTableDisplayConfig.customForm)
export const customForms: Record<string, ComponentType<CustomFormProps>> = {
  masttyp: MasttypForm,
  leuchtentyp: LeuchentypForm,
  rundsteuerempfaenger: RundsteuerempfaengerForm,
};
