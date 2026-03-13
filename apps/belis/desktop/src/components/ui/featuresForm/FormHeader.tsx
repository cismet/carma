import { EditOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { Badge, Button, Spin, Tooltip } from "antd";
import { useSelector } from "react-redux";
import { getDraftFeaturesCount } from "../../../store/slices/featuresForms";

interface FormHeaderProps {
  title: string;
  subtitle: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSave?: () => void;
  loading?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  hasDraft?: boolean;
  onToggleReadOnly?: () => void;
}

const FormHeader = ({
  title,
  subtitle,
  cancelLabel = "",
  onCancel,
  onSave,
  loading,
  saving,
  readOnly,
  hasDraft,
  onToggleReadOnly,
}: FormHeaderProps) => {
  const draftsCount = useSelector(getDraftFeaturesCount);

  return (
    <div className="flex flex-col border-b border-gray-100">
      <div className="flex items-center justify-between flex-wrap p-6 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <Tooltip title={readOnly ? "Bearbeiten" : "Sperren"}>
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                readOnly
                  ? "bg-gray-100 cursor-pointer hover:bg-gray-200"
                  : "bg-blue-100 cursor-pointer hover:bg-blue-200"
              } transition-colors`}
              onClick={onToggleReadOnly}
            >
              {loading ? (
                <Spin size="small" />
              ) : (
                <EditOutlined
                  className={`text-xl ${
                    readOnly ? "text-gray-500" : "text-blue-600"
                  }`}
                />
              )}
            </div>
          </Tooltip>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap">
                {title}
              </h2>
              {hasDraft && (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-gray-300 bg-[#f9fafb] text-gray-500 text-xs font-medium">
                  <ExclamationCircleOutlined className="text-[11px]" />
                  nicht gespeicherte Änderungen
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <Button onClick={onCancel} disabled={saving}>
                Abbrechen {cancelLabel}
              </Button>
              <Badge
                count={draftsCount}
                size="small"
                offset={[0, 0]}
                style={{
                  backgroundColor: "#faad14",
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  lineHeight: "18px",
                  padding: "0 4px",
                  fontSize: 11,
                }}
              >
                <Button type="primary" onClick={onSave} loading={saving}>
                  Speichern
                </Button>
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormHeader;
