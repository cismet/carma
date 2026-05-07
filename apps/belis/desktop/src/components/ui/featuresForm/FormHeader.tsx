import { useState } from "react";
import {
  ArrowLeftOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { Badge, Button, Spin, Tooltip } from "antd";
import { useSelector, useDispatch } from "react-redux";
import {
  getDraftFeaturesCount,
  getAllDrafts,
  removeDraft,
} from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { incrementFeatureDataVersion } from "../../../store/slices/featureCollection";
import { handleSaveAllDrafts } from "../../../helper/featureFormSaveHelpers";
import { useSingleSave } from "./FeaturesFormsWrapper";

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
  onBack?: () => void;
  isCreation?: boolean;
  customDraftsCount?: number;
  onSaveAll?: () => void;
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
  onBack,
  isCreation,
  customDraftsCount,
  onSaveAll,
}: FormHeaderProps) => {
  const dispatch = useDispatch();
  const featureDraftsCount = useSelector(getDraftFeaturesCount);
  const drafts = useSelector(getAllDrafts);
  const jwt = useSelector(getJWT);
  const [savingAll, setSavingAll] = useState(false);
  const { onSaveSingle, savingSingle } = useSingleSave();

  const draftsCount = customDraftsCount ?? featureDraftsCount;

  const handleSaveAll = () => {
    if (onSaveAll) {
      onSaveAll();
      return;
    }
    handleSaveAllDrafts({
      jwt,
      drafts,
      draftCount: draftsCount,
      setSaving: setSavingAll,
      dispatch,
      removeDraft,
      incrementFeatureDataVersion,
    });
  };

  return (
    <div className="flex flex-col border-b border-gray-100">
      <div className="flex items-center justify-between flex-wrap p-6 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          {onBack && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              className="flex-shrink-0"
            />
          )}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              readOnly ? "bg-gray-100" : "bg-blue-100"
            } transition-colors`}
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
              <span style={!hasDraft ? { cursor: "not-allowed" } : undefined}>
                <Button
                  onClick={hasDraft ? onCancel : undefined}
                  disabled={saving}
                  style={
                    !hasDraft
                      ? {
                          pointerEvents: "none",
                          color: "#d9d9d9",
                          borderColor: "#d9d9d9",
                          backgroundColor: "#f5f5f5",
                        }
                      : undefined
                  }
                >
                  {isCreation
                    ? "Verlassen ohne zu speichern"
                    : cancelLabel
                    ? `${cancelLabel}: zurücksetzen`
                    : "zurücksetzen"}
                </Button>
              </span>
              <span
                style={
                  !hasDraft || !onSaveSingle
                    ? { cursor: "not-allowed" }
                    : undefined
                }
              >
                <Button
                  type="primary"
                  onClick={
                    hasDraft && onSaveSingle ? onSaveSingle : undefined
                  }
                  loading={savingSingle}
                  style={
                    !hasDraft || !onSaveSingle
                      ? {
                          pointerEvents: "none",
                          color: "#d9d9d9",
                          borderColor: "#d9d9d9",
                          backgroundColor: "#f5f5f5",
                        }
                      : undefined
                  }
                >
                  Speichern
                </Button>
              </span>
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
                <span
                  style={
                    draftsCount === 0 ? { cursor: "not-allowed" } : undefined
                  }
                >
                  <Button
                    type="primary"
                    onClick={draftsCount >= 1 ? handleSaveAll : undefined}
                    loading={draftsCount >= 1 ? savingAll : false}
                    style={
                      draftsCount === 0
                        ? {
                            pointerEvents: "none",
                            color: "#d9d9d9",
                            borderColor: "#d9d9d9",
                            backgroundColor: "#f5f5f5",
                          }
                        : undefined
                    }
                  >
                    Alle speichern
                  </Button>
                </span>
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormHeader;
