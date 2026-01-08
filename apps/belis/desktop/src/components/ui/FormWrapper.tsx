import { useRef, useState } from "react";
import { CheckCircleOutlined, CloseOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { CustomCard } from "../commons/CustomCard";
import KeyTableItemForm from "./KeyTableItemForm";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";
import { customForms } from "./forms";

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

interface FormWrapperProps {
  selectedItem: SelectedItem;
  onSave: (updatedItem: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const FormWrapper = ({ selectedItem, onSave, readOnly = false }: FormWrapperProps) => {
  const [formHasChanges, setFormHasChanges] = useState(false);
  const formRef = useRef<FormInstance | null>(null);

  const customFormKey = keyTableDisplayConfig[selectedItem.tableName]?.customForm;
  const FormComponent = (customFormKey && customForms[customFormKey]) || KeyTableItemForm;

  return (
    <CustomCard
      title={`${getItemDisplayText(
        selectedItem.item,
        selectedItem.tableName,
        keyTableDisplayConfig
      )}`}
      style={{ height: "100%" }}
      extra={
        !readOnly && (
          <div className="flex items-center gap-2">
            <CheckCircleOutlined
              className={
                formHasChanges
                  ? "cursor-pointer hover:text-green-500"
                  : "cursor-not-allowed text-gray-300"
              }
              onClick={() => {
                if (formHasChanges) {
                  formRef.current?.submit();
                }
              }}
            />
            <CloseOutlined
              className={
                formHasChanges
                  ? "cursor-pointer hover:text-red-500"
                  : "cursor-not-allowed text-gray-300"
              }
              onClick={() => {
                if (formHasChanges) {
                  formRef.current?.resetFields();
                  setFormHasChanges(false);
                }
              }}
            />
          </div>
        )
      }
    >
      <div className="h-full">
        <div className="w-full">
          <FormComponent
            key={`${selectedItem.tableName}-${selectedItem.item.id}`}
            item={selectedItem.item}
            tableName={selectedItem.tableName}
            onSave={onSave}
            onFormReady={(form) => (formRef.current = form)}
            onValuesChange={setFormHasChanges}
            disabled={readOnly}
          />
        </div>
      </div>
    </CustomCard>
  );
};

export default FormWrapper;
