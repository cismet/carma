import { ComponentType } from "react";
import { FormInstance } from "antd";
import MasttypForm from "./MasttypForm";
import LeuchentypForm from "./LeuchentypForm";
import RundsteuerempfaengerForm from "./RundsteuerempfaengerForm";
import InfobausteinTemplateForm from "./InfobausteinTemplateForm";

export interface CustomFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
  isSaving?: boolean;
}

// Registry keyed by form name (referenced in keyTableDisplayConfig.customForm)
export const customForms: Record<string, ComponentType<CustomFormProps>> = {
  masttyp: MasttypForm,
  leuchtentyp: LeuchentypForm,
  rundsteuerempfaenger: RundsteuerempfaengerForm,
  infobausteinTemplate: InfobausteinTemplateForm,
};
