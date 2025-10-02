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

  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>Status ändern</div>
          <Text type="secondary">
            {feature?.properties?.info?.title || "Baum"}
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
          <Radio.Group style={{ width: "100%", marginBottom: 15 }} buttonStyle="solid">
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="open"
            >
              Gestartet
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="done"
            >
              Abgeschlossen
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value="exception"
            >
              Ausnahme
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
            <img
              src={imagePreview}
              alt="preview"
              style={{ width: "100%" }}
            />
          </div>
        )}

        <Form.Item name="remarks" label="Bemerkungen">
          <TextArea rows={4} placeholder="Optionale Bemerkungen..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SetStatusDialog;
