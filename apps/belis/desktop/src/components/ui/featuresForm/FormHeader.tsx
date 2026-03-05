import { EditOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { Button, Spin, Tooltip } from "antd";

interface FormHeaderProps {
  title: string;
  subtitle: string;
  onCancel?: () => void;
  onSave?: () => void;
  loading?: boolean;
  readOnly?: boolean;
  onToggleReadOnly?: () => void;
}

const FormHeader = ({
  title,
  subtitle,
  onCancel,
  onSave,
  loading,
  readOnly,
  onToggleReadOnly,
}: FormHeaderProps) => {
  return (
    <div className="flex flex-col border-b border-gray-100">
      <div className="flex items-start justify-between p-6 pb-2 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            {loading ? (
              <Spin size="small" />
            ) : (
              <EditOutlined className="text-xl text-blue-600" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap">
              {title}
            </h2>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {onToggleReadOnly && (
          <Tooltip title={readOnly ? "Bearbeiten" : "Sperren"}>
            <Button
              icon={readOnly ? <LockOutlined /> : <UnlockOutlined />}
              onClick={onToggleReadOnly}
              size="small"
            />
          </Tooltip>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2 justify-end px-6 pb-4">
          <Button size="small" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="primary" size="small" onClick={onSave}>
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
};

export default FormHeader;
