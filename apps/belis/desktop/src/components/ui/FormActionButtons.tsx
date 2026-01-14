import { Button } from "antd";

interface FormActionButtonsProps {
  formHasChanges: boolean;
  onReset?: () => void;
}

const FormActionButtons = ({
  formHasChanges,
  onReset,
}: FormActionButtonsProps) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 16,
      }}
    >
      <Button type="primary" htmlType="submit" disabled={!formHasChanges}>
        Speichern
      </Button>
      <Button onClick={onReset} disabled={!formHasChanges}>
        Abbrechen
      </Button>
    </div>
  );
};

export default FormActionButtons;
