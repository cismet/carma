import { useState } from "react";
import { Button, Modal, message, Space } from "antd";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "../../store";
import {
  clearAllDrafts,
  getAllDrafts,
  getDraftFeaturesCount,
  removeDraft,
} from "../../store/slices/featuresForms";
import { getJWT } from "../../store/slices/auth";
import { incrementFeatureDataVersion } from "../../store/slices/featureCollection";
import { saveAllFeatureDrafts } from "../../helper/featureFormSaveHelpers";

const SendOrDiscardAllDraftsButton = () => {
  const dispatch: AppDispatch = useDispatch();
  const draftCount = useSelector(getDraftFeaturesCount);
  const drafts = useSelector(getAllDrafts);
  const jwt = useSelector(getJWT);
  const [saving, setSaving] = useState(false);

  if (draftCount === 0) return null;

  const handleSaveAll = () => {
    Modal.confirm({
      title: "Alle Entwürfe speichern?",
      content: `${draftCount} Entwurf${
        draftCount > 1 ? "e" : ""
      } werden gespeichert.`,
      okText: "Alle speichern",
      cancelText: "Abbrechen",
      onOk: async () => {
        if (!jwt) {
          message.error("Nicht authentifiziert");
          return;
        }

        setSaving(true);
        try {
          const result = await saveAllFeatureDrafts(jwt, drafts);

          // Remove successful drafts from Redux
          for (const featureId of result.succeeded) {
            dispatch(removeDraft(featureId));
          }

          // Trigger refetch of currently displayed feature data
          if (result.succeeded.length > 0) {
            dispatch(incrementFeatureDataVersion());
          }

          // Show per-failure error messages
          for (const fail of result.failed) {
            message.error(`${fail.featureType}: ${fail.error}`);
          }

          // Show summary
          const total = result.succeeded.length + result.failed.length;
          if (result.failed.length === 0) {
            message.success(
              `Alle ${result.succeeded.length} Entwürfe gespeichert`
            );
          } else if (result.succeeded.length === 0) {
            message.error("Alle Entwürfe fehlgeschlagen");
          } else {
            message.warning(
              `${result.succeeded.length} von ${total} gespeichert, ${result.failed.length} fehlgeschlagen`
            );
          }
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <Space size="small">
      <Button
        icon={<SaveOutlined />}
        type="primary"
        size="small"
        loading={saving}
        onClick={handleSaveAll}
      >
        Alle speichern
      </Button>
      <Button
        icon={<DeleteOutlined />}
        danger
        size="small"
        disabled={saving}
        onClick={() => {
          Modal.confirm({
            title: "Alle Entwürfe verwerfen?",
            content: `${draftCount} nicht gespeicherte Änderung${
              draftCount > 1 ? "en" : ""
            } werden unwiderruflich gelöscht.`,
            okText: "Alle verwerfen",
            okButtonProps: { danger: true },
            cancelText: "Abbrechen",
            onOk: () => {
              dispatch(clearAllDrafts());
              message.success("Alle Entwürfe verworfen");
            },
          });
        }}
      >
        Alle verwerfen
      </Button>
    </Space>
  );
};

export default SendOrDiscardAllDraftsButton;
