import { useCallback } from "react";
import { Modal, Button, Form } from "antd";
import type { AktionDefinition, AktionFormValues } from "./aktionFieldConfig";
import AktionFieldRenderer from "./AktionFieldRenderer";

interface AktionModalProps {
  /** The action definition to render, or null when hidden */
  aktion: AktionDefinition | null;
  /** The fachobjekt type key (e.g. "tdta_standort_mast") */
  fachobjektType: string;
  open: boolean;
  onClose: () => void;
  /** Called with form values on submit. Defaults to console.log. */
  onSubmit?: (
    aktionLabel: string,
    fachobjektType: string,
    values: AktionFormValues,
  ) => void;
}

const AktionModal = ({
  aktion,
  fachobjektType,
  open,
  onClose,
  onSubmit,
}: AktionModalProps) => {
  const [form] = Form.useForm();

  const handleSubmit = useCallback(() => {
    form
      .validateFields()
      .then((values: AktionFormValues) => {
        if (onSubmit) {
          onSubmit(aktion?.label ?? "", fachobjektType, values);
        } else {
          console.log("[AktionModal] Submit", {
            aktion: aktion?.label,
            fachobjektType,
            values,
          });
        }
        form.resetFields();
        onClose();
      })
      .catch((info: unknown) => {
        console.log("[AktionModal] Validate Failed:", info);
      });
  }, [form, aktion, fachobjektType, onSubmit, onClose]);

  const handleCancel = useCallback(() => {
    form.resetFields();
    onClose();
  }, [form, onClose]);

  if (!aktion) return null;

  return (
    <Modal
      title={aktion.label}
      open={open}
      onCancel={handleCancel}
      footer={
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={handleCancel}>Aktion abbrechen</Button>
          <Button type="primary" onClick={handleSubmit}>
            Aktion ausführen
          </Button>
        </div>
      }
      width={600}
      centered
      destroyOnClose
      styles={{
        body: { paddingTop: 16 },
        header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        {aktion.fields.map((field) => (
          <AktionFieldRenderer key={field.name} field={field} />
        ))}
      </Form>
    </Modal>
  );
};

export default AktionModal;
