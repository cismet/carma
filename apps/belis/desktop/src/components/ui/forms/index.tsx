import { ComponentType } from "react";
import { FormInstance } from "antd";

export interface CustomFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
}

const PlaceholderForm = () => <div>Custom Form Placeholder</div>;

// Registry keyed by form name (referenced in keyTableDisplayConfig.customForm)
export const customForms: Record<string, ComponentType<CustomFormProps>> = {
  placeholder: PlaceholderForm,
};
