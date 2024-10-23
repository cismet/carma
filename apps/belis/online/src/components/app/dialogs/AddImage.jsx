import { UploadOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Typography, Upload } from "antd";
import { useState } from "react";
import {
  IMAGEUPLOAD_MAXSIDE,
  IMAGEUPLOAD_QUALITY,
} from "../../../constants/belis";

import extensions from "../../../core/helper/extensions";
import { shrinkBase64Image } from "../../../core/helper/imageHelper";

const { Text } = Typography;
const getBase64 = (img, callback) => {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    callback(reader.result);
  });
  reader.readAsDataURL(img);
};
const dummyRequest = ({ file, onSuccess }) => {
  setTimeout(() => {
    onSuccess("ok");
  }, 0);
};
const AddImageDialog = ({
  close = () => {},
  onCancel = (output) => {},
  onClose = (output) => {},
  input = {},
}) => {
  const [imageData, setImageData] = useState();
  const handleChange = (info) => {
    if (info.file.status === "uploading") {
      return;
    }
    if (info.file.status === "done") {
      // Get this url from response in real world.
      getBase64(info.file.originFileObj, (imageUrl) => {
        //info.file.imageData=imageUrl;
        shrinkBase64Image(
          imageUrl,
          IMAGEUPLOAD_MAXSIDE,
          IMAGEUPLOAD_QUALITY,
          (shrinked) => {
            setImageData(shrinked);
          }
        );
      });
    }
  };
  const [form] = Form.useForm();

  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>Foto hinzufügen</div>{" "}
          <Text type="secondary">{input?.vcard?.infobox?.title}</Text>
        </>
      }
      centered
      visible={true}
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            // imageData comes from state not from values

            const mimeType = imageData.match("data:(.*);")[1];
            const ending = extensions[mimeType];
            const feature = input.feature;

            const parameter = {
              ImageData: imageData,
              ending,
              description: values.name,
              objekt_id: feature.properties.id,
              objekt_typ: feature.featuretype,
              object_name: feature.properties.name,
              ts: Date.now(),
              prefix: "DOC-", //the dev prefix should only be set in a dev environment to protect the webdav from cluttering
            };

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
      okButtonProps={{ disabled: false }}
      cancelButtonProps={{ disabled: false }}
    >
      <Form
        form={form}
        layout="vertical"
        name="form_in_modal"
        initialValues={{
          modifier: "public",
        }}
      >
        <Form.Item
          name="picture"
          label="Bild"
          rules={[
            {
              required: true,
              message: "Bitte wählen Sie ein Bild aus.",
            },
          ]}
        >
          <Upload
            //style={{ width: "100%" }}
            name="upload"
            _listType="picture-card"
            className="avatar-uploader"
            showUploadList={false}
            // beforeUpload={beforeUpload}
            onChange={handleChange}
            customRequest={dummyRequest}
          >
            <Button style_={{ width: "100%" }} icon={<UploadOutlined />}>
              Foto aufnehmen oder schon aufgenommenes Foto auswählen
            </Button>
          </Upload>
        </Form.Item>

        <div style={{ marginTop: 20 }}>
          {imageData && (
            <div>
              <img
                src={imageData}
                alt="avatar"
                style={{ width: "100%", marginBottom: 20 }}
              />
            </div>
          )}
        </div>
        <Form.Item
          name="name"
          label="Name"
          rules={[
            {
              required: true,
              message: "Bitte geben Sie eine Namen für das Bild an.",
            },
          ]}
        >
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddImageDialog;
