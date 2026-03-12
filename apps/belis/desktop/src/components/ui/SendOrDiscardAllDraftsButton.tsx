import { Button, Modal, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "../../store";
import {
  clearAllDrafts,
  getDraftFeaturesCount,
} from "../../store/slices/featuresForms";

const SendOrDiscardAllDraftsButton = () => {
  const dispatch: AppDispatch = useDispatch();
  const draftCount = useSelector(getDraftFeaturesCount);

  if (draftCount === 0) return null;

  return (
    <Button
      icon={<DeleteOutlined />}
      danger
      size="small"
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
  );
};

export default SendOrDiscardAllDraftsButton;
