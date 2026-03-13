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
import { handleSaveAllDrafts } from "../../helper/featureFormSaveHelpers";

const SendOrDiscardAllDraftsButton = () => {
  const dispatch: AppDispatch = useDispatch();
  const draftCount = useSelector(getDraftFeaturesCount);
  const drafts = useSelector(getAllDrafts);
  const jwt = useSelector(getJWT);
  const [saving, setSaving] = useState(false);

  if (draftCount === 0) return null;

  const handleSaveAll = () => {
    handleSaveAllDrafts({
      jwt,
      drafts,
      draftCount,
      setSaving,
      dispatch,
      removeDraft,
      incrementFeatureDataVersion,
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
