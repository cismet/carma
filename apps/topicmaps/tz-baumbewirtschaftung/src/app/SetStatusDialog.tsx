import {
  UploadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Typography,
  Upload,
  message,
  Tooltip,
} from "antd";
import TextArea from "antd/lib/input/TextArea";
import { useState } from "react";
import { useSync } from "@carma-providers/syncing";

const { Text } = Typography;

// App-specific payload type for tree actions
interface TreeActionPayload {
  [key: string]: unknown;
  key: string;
  status: "open" | "done" | "exception";
  payload: {
    pic?: string;
    user: string;
  };
  created_at: string;
  action_time: string;
  description: string;
  status_reason: string;
  fk_tree: number;
}

interface SetStatusDialogProps {
  close?: () => void;
  onCancel?: () => void;
  onClose?: (parameter: any) => void;
  onUpcomingAction?: (actionPayload: TreeActionPayload) => void;
  feature?: any;
  username?: string | null;
}

const dummyRequest = ({ file, onSuccess }: any) => {
  setTimeout(() => {
    onSuccess("ok");
  }, 0);
};

const SetStatusDialog = ({
  close = () => {},
  onCancel = () => {},
  onClose = () => {},
  onUpcomingAction,
  feature = {},
  username,
}: SetStatusDialogProps) => {
  const [form] = Form.useForm();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { status: syncStatus, syncedAction } = useSync();

  // Check for devMode URL parameter (supports hash-based routing)
  const isDevMode = (() => {
    const hashParams = window.location.hash.split("?")[1];
    if (hashParams) {
      return new URLSearchParams(hashParams).has("devMode");
    }
    return new URLSearchParams(window.location.search).has("devMode");
  })();

  // Compute default status based on the 90% rule
  const getDefaultStatus = (): "open" | "done" | "exception" => {
    const latestStatus = feature?.properties?.latestActionStatus;
    // If no action exists, presume the user wants to start
    if (!latestStatus || latestStatus === "none") {
      return "open";
    }
    // If the task is started (open), presume the user wants to close it
    if (latestStatus === "open") {
      return "done";
    }
    // If the task is in an exception state, presume the user wants to close it
    if (latestStatus === "exception") {
      return "done";
    }
    // For any other status (e.g., already done), default to open for a new cycle
    return "open";
  };

  const handleUploadChange = (info: any) => {
    if (info.file.status === "done") {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImagePreview(reader.result as string);
      });
      reader.readAsDataURL(info.file.originFileObj);
    }
  };

  const p = feature.properties || {};

  const handleSave = async () => {
    try {
      // Validate image is attached (skip in devMode)
      if (!imagePreview && !isDevMode) {
        message.error("Bitte ein Foto hinzufügen.");
        return;
      }

      const values = await form.validateFields();
      setIsSaving(true);

      const now = new Date();
      const isoNow = now.toISOString();

      // Build the action payload according to the server spec
      const actionPayload: TreeActionPayload = {
        key: "shoot_cutting", // TODO: Make this configurable based on action type
        status: values.status,
        payload: {
          pic: imagePreview || undefined,
          user: values.user,
        },
        created_at: isoNow,
        action_time: isoNow,
        description: getStatusDescription(values.status),
        status_reason: values.remarks || getStatusName(values.status),
        fk_tree: feature.properties?.id || feature.id,
      };

      // Notify parent for optimistic update before syncing
      if (onUpcomingAction) {
        onUpcomingAction(actionPayload);
      }

      const actionId = await syncedAction("uploadTzbTreeAction", actionPayload);
      message.success("Aktion wurde gespeichert und wird synchronisiert");

      // Also call the original onClose for any local updates
      const parameter = {
        status: values.status,
        user: values.user,
        remarks: values.remarks,
        image: imagePreview,
        featureId: feature?.id,
        actionId,
      };

      form.resetFields();
      setImagePreview(null);
      onClose(parameter);
      close();
    } catch (error) {
      console.error("[SetStatusDialog] Failed to save:", error);
      message.error("Fehler beim Speichern: " + String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case "open":
        return "Zurückschneiden von Stamm und Stockaustrieb";
      case "done":
        return "Arbeiten abgeschlossen";
      case "exception":
        return "Ausnahme bei der Bearbeitung";
      default:
        return "Status geändert";
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case "open":
        return "Schnittarbeiten begonnen";
      case "done":
        return "Abgeschlossen";
      case "exception":
        return "Ausnahme";
      default:
        return "";
    }
  };

  // Sync status indicator
  const SyncStatusIndicator = () => {
    if (!syncStatus.isReady) {
      return (
        <Tooltip title="Sync wird initialisiert...">
          <SyncOutlined spin style={{ color: "#faad14", marginLeft: 8 }} />
        </Tooltip>
      );
    }
    if (syncStatus.isConnected) {
      return (
        <Tooltip title={`Verbunden (${syncStatus.pendingCount} ausstehend)`}>
          <CheckCircleOutlined style={{ color: "#52c41a", marginLeft: 8 }} />
        </Tooltip>
      );
    }
    return (
      <Tooltip title={syncStatus.lastError || "Nicht verbunden"}>
        <WarningOutlined style={{ color: "#ff4d4f", marginLeft: 8 }} />
      </Tooltip>
    );
  };

  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span>Status ändern</span>
            <SyncStatusIndicator />
          </div>
          <Text type="secondary">
            {p.baumart_botanisch +
              " (" +
              p.standort_nr +
              "." +
              p.zusatz +
              "." +
              p.lfd_nr_str +
              ")"}
          </Text>
        </>
      }
      centered
      open={true}
      onOk={handleSave}
      onCancel={() => {
        onCancel();
        close();
      }}
      okText={isSaving ? "Speichern..." : "Speichern"}
      cancelText="Abbrechen"
      okButtonProps={{
        loading: isSaving,
        disabled: !syncStatus.isReady || (!imagePreview && !isDevMode),
      }}
    >
      <Form
        form={form}
        layout="vertical"
        name="status_form"
        initialValues={{
          user: username || "",
          status: getDefaultStatus(),
        }}
      >
        <Form.Item
          name="status"
          label="Status"
          rules={[
            {
              required: true,
              message: "Bitte einen Status auswählen.",
            },
          ]}
        >
          <Radio.Group
            style={{ width: "100%", marginBottom: 15 }}
            buttonStyle="solid"
          >
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="open"
            >
              <span className="status-emoji">▶️</span>
              <span className="status-text">Gestartet</span>
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="done"
            >
              <span className="status-emoji">✅</span>
              <span className="status-text">Abgeschlossen</span>
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="exception"
            >
              <span className="status-emoji">⚠️</span>
              <span className="status-text">Ausnahme</span>
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="user" label="Benutzer">
          <Input disabled />
        </Form.Item>

        <Form.Item
          name="picture"
          label="Foto"
          required={!isDevMode}
          tooltip={isDevMode ? undefined : "Ein Foto ist erforderlich"}
        >
          <Upload
            name="upload"
            className="avatar-uploader"
            showUploadList={false}
            onChange={handleUploadChange}
            customRequest={dummyRequest}
          >
            <Button style={{ width: "100%" }} icon={<UploadOutlined />}>
              Foto hinzufügen
            </Button>
          </Upload>
        </Form.Item>

        {imagePreview && (
          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <img src={imagePreview} alt="preview" style={{ width: "100%" }} />
          </div>
        )}

        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => (
            <Form.Item
              name="remarks"
              label="Bemerkungen"
              rules={[
                {
                  validator(_, value) {
                    if (getFieldValue("status") === "exception" && !value) {
                      return Promise.reject(
                        new Error("Bemerkungen sind bei Ausnahme erforderlich.")
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <TextArea
                rows={4}
                placeholder={
                  getFieldValue("status") === "exception"
                    ? "Bemerkungen erforderlich bei Ausnahme..."
                    : "Optionale Bemerkungen..."
                }
              />
            </Form.Item>
          )}
        </Form.Item>
      </Form>

      {/* Debug info in development */}
      {syncStatus.pendingCount > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 8,
            background: "#fffbe6",
            borderRadius: 4,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            <SyncOutlined spin style={{ marginRight: 4 }} />
            {syncStatus.pendingCount} Aktion(en) werden synchronisiert...
          </Text>
        </div>
      )}
    </Modal>
  );
};

export default SetStatusDialog;
