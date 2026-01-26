import { Button } from "antd";

interface FormActionButtonsProps {
  formHasChanges: boolean;
  onReset?: () => void;
  hasValidationErrors?: boolean;
}

const FormActionButtons = ({
  formHasChanges,
  onReset,
  hasValidationErrors = false,
}: FormActionButtonsProps) => {
  return (
    <div className="flex flex-wrap justify-start xl:justify-end gap-2 mt-4">
      <Button
        type="primary"
        htmlType="submit"
        disabled={!formHasChanges || hasValidationErrors}
      >
        Speichern
      </Button>
      <Button onClick={onReset} disabled={!formHasChanges}>
        Abbrechen
      </Button>
    </div>
  );
};

export default FormActionButtons;
