import { UploadOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Radio, Typography, Upload } from "antd";
import TextArea from "antd/lib/input/TextArea";
import { useState } from "react";

const { Text } = Typography;

const dummyRequest = ({ file, onSuccess }) => {
  setTimeout(() => {
    onSuccess("ok");
  }, 0);
};

const SetStatusDialog = ({
  close = () => {},
  onCancel = () => {},
  onClose = () => {},
  feature = {},
}) => {
  const [form] = Form.useForm();
  const [imagePreview, setImagePreview] = useState(null);

  const handleUploadChange = (info) => {
    if (info.file.status === "done") {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImagePreview(reader.result);
      });
      reader.readAsDataURL(info.file.originFileObj);
    }
  };
  const p = feature.properties;
  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>Status ändern</div>
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
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            const parameter = {
              status: values.status,
              user: values.user,
              remarks: values.remarks,
              image: imagePreview,
              featureId: feature?.id,
            };

            console.log("Status change parameter:", parameter);
            form.resetFields();
            onClose(parameter);
            close();
          })
          .catch((info) => {
            console.log("Validate Failed:", info);
          });
      }}
      onCancel={() => {
        onCancel();
        close();
      }}
      okText="Speichern"
      cancelText="Abbrechen"
    >
      <Form
        form={form}
        layout="vertical"
        name="status_form"
        initialValues={{
          user: "Max Mustermann",
          status: "open",
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

        <Form.Item name="picture" label="Foto">
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
    </Modal>
  );
};

export default SetStatusDialog;
