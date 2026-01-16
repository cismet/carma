import React from "react";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { message, Upload } from "antd";

const { Dragger } = Upload;

const props: UploadProps = {
  name: "file",
  multiple: true,
  beforeUpload: () => {
    return false;
  },
  onChange(info) {
    console.log(info.file, info.fileList);
    message.success(`${info.file.name} Datei hinzugefügt.`);
  },
  onDrop(e) {
    console.log("Dropped files", e.dataTransfer.files);
  },
};

const DocumentUploader = () => {
  return (
    <>
      <Dragger {...props}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          Klicken oder Datei hierher ziehen zum Hochladen
        </p>
        <p className="ant-upload-hint">
          Unterstützung für Einzel- oder Mehrfach-Upload.
        </p>
      </Dragger>
    </>
  );
};

export default DocumentUploader;
