import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { FormInstance } from "antd";
import { Button } from "antd";
import { CustomCard } from "../commons/CustomCard";
import KeyTableItemForm from "./KeyTableItemForm";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";
import { customForms } from "./forms";
import { getJWT } from "../../store/slices/auth";

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

interface FormWrapperProps {
  selectedItem: SelectedItem;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  readOnly?: boolean;
}

const FormWrapper = ({ selectedItem, onSave, onIdUpdated, readOnly = false }: FormWrapperProps) => {
  const [formHasChanges, setFormHasChanges] = useState(false);
  const formRef = useRef<FormInstance | null>(null);
  const jwt = useSelector(getJWT);

  // Reset formHasChanges when selected item changes
  useEffect(() => {
    setFormHasChanges(false);
  }, [selectedItem.item.id, selectedItem.tableName]);

  const customFormKey = keyTableDisplayConfig[selectedItem.tableName]?.customForm;
  const FormComponent = (customFormKey && customForms[customFormKey]) || KeyTableItemForm;

  // Check if this is a temporary unsaved item (created with -Date.now())
  // Temporary IDs are very large negative numbers (like -1736441234567)
  const isNewItem = (selectedItem.item.id as number) < -1000000000;
  const title = isNewItem
    ? "Neuer Eintrag"
    : getItemDisplayText(selectedItem.item, selectedItem.tableName, keyTableDisplayConfig);

  const handleReset = () => {
    formRef.current?.resetFields();
    setFormHasChanges(false);
  };

  const handleSubmit = () => {
    formRef.current?.submit();
  };

  return (
    <CustomCard title={title} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        <FormComponent
          key={`${selectedItem.tableName}-${selectedItem.item.id}`}
          item={selectedItem.item}
          tableName={selectedItem.tableName}
          onSave={onSave}
          onIdUpdated={onIdUpdated}
          onFormReady={(form) => (formRef.current = form)}
          onValuesChange={setFormHasChanges}
          disabled={readOnly}
          jwt={jwt}
          formHasChanges={formHasChanges}
          onReset={handleReset}
          hideButtons={true}
        />
      </div>
      {!readOnly && (
        <div style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          paddingTop: 16,
          borderTop: "1px solid #f0f0f0",
          marginTop: 16
        }}>
          <Button onClick={handleReset} disabled={!formHasChanges}>
            Abbrechen
          </Button>
          <Button type="primary" onClick={handleSubmit} disabled={!formHasChanges}>
            Speichern
          </Button>
        </div>
      )}
    </CustomCard>
  );
};

export default FormWrapper;
