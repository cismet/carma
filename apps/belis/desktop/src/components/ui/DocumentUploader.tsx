import { InboxOutlined } from "@ant-design/icons";
import type { UploadProps, UploadFile } from "antd";
import { message, Upload } from "antd";

const { Dragger } = Upload;

interface DocumentUploaderProps {
  onFilesChange?: (files: UploadFile[]) => void;
  fileList?: UploadFile[];
  uploadText?: string;
}

const DocumentUploader = ({
  onFilesChange,
  fileList,
  uploadText = "Klicken oder Datei hierher ziehen zum Hochladen",
}: DocumentUploaderProps) => {
  const uploadProps: UploadProps = {
    name: "file",
    multiple: true,
    fileList,
    beforeUpload: () => {
      return false;
    },
    onChange(info) {
      onFilesChange?.(info.fileList);
      if (info.file.status !== "removed") {
        message.success(`${info.file.name} Datei hinzugefügt.`);
      }
    },
    onDrop(e) {
      console.log("Dropped files", e.dataTransfer.files);
    },
    onRemove() {
      return true;
    },
  };

  return (
    <Dragger {...uploadProps} style={{ height: "100%" }}>
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">{uploadText}</p>
    </Dragger>
  );
};

export default DocumentUploader;
