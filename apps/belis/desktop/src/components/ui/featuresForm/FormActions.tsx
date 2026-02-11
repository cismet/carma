import { Button } from "antd";

interface FormActionsProps {
  onCancel?: () => void;
  onSave?: () => void;
}

const FormActions = ({ onCancel, onSave }: FormActionsProps) => {
  return (
    <div className="flex gap-3">
      <Button
        size="large"
        className="px-6 rounded-lg border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
        onClick={onCancel}
      >
        Abbrechen
      </Button>
      <Button
        type="primary"
        size="large"
        className="px-6 rounded-lg bg-blue-600 hover:bg-blue-700"
        onClick={onSave}
      >
        Speichern
      </Button>
    </div>
  );
};

export default FormActions;
