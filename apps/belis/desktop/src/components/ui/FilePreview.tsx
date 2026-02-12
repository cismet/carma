import { useState, useEffect } from "react";
import { Spin } from "antd";
import {
  FilePdfOutlined,
  FileOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import { getDocumentBlobUrl } from "../../helper/documentHelper";
import type { DokumentItem } from "./DocumentPreview";

type FilePreviewSize = "sm" | "md" | "xl" | "xxl";

const SIZE_MAP: Record<FilePreviewSize, { box: number; icon: number }> = {
  sm: { box: 48, icon: 24 },
  md: { box: 80, icon: 40 },
  xl: { box: 120, icon: 60 },
  xxl: { box: 160, icon: 80 },
};

interface FilePreviewProps {
  documents: DokumentItem[];
  jwt?: string;
  titleStyle?: React.CSSProperties;
  title?: string;
  size?: FilePreviewSize;
  showDescription?: boolean;
}

type FileType = "image" | "pdf" | "other";

const getFileType = (objectName: string): FileType => {
  const lowerName = objectName.toLowerCase();
  if (
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".gif")
  ) {
    return "image";
  }
  if (lowerName.endsWith(".pdf")) {
    return "pdf";
  }
  return "other";
};

const getFileIcon = (objectName: string, iconSize: number) => {
  const fileType = getFileType(objectName);
  const style = { fontSize: iconSize, color: "#8c8c8c" };

  if (fileType === "image") {
    return <FileImageOutlined style={{ ...style, color: "#1890ff" }} />;
  }
  if (fileType === "pdf") {
    return <FilePdfOutlined style={{ ...style, color: "#ff4d4f" }} />;
  }
  return <FileOutlined style={style} />;
};

interface FileItemProps {
  doc: DokumentItem;
  jwt?: string;
  size: FilePreviewSize;
  showDescription: boolean;
}

const FileItem = ({ doc, jwt, size, showDescription }: FileItemProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const { box: boxSize, icon: iconSize } = SIZE_MAP[size];
  const objectName = doc.dms_url?.url?.object_name || "";
  const fileType = getFileType(objectName);
  const description =
    doc.dms_url?.description || doc.dms_url?.url?.object_name || "Datei";

  useEffect(() => {
    if (!jwt || !objectName || fileType !== "image") {
      return;
    }

    const fetchPreview = async () => {
      setLoading(true);
      setError(false);

      try {
        const url = await getDocumentBlobUrl(jwt, objectName);
        setPreviewUrl(url);
      } catch (err) {
        console.error("Failed to load preview:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [jwt, objectName, fileType]);

  const boxStyle: React.CSSProperties = {
    width: boxSize,
    height: boxSize,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    border: "1px solid #d9d9d9",
  };

  const renderContent = () => {
    if (fileType !== "image") {
      return <div style={boxStyle}>{getFileIcon(objectName, iconSize)}</div>;
    }

    if (loading) {
      return (
        <div style={boxStyle}>
          <Spin size={size === "sm" ? "small" : "default"} />
        </div>
      );
    }

    if (error || !previewUrl) {
      return <div style={boxStyle}>{getFileIcon(objectName, iconSize)}</div>;
    }

    return (
      <img
        src={previewUrl}
        alt={description}
        style={{
          width: boxSize,
          height: boxSize,
          objectFit: "cover",
          borderRadius: 4,
          border: "1px solid #d9d9d9",
        }}
      />
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      {renderContent()}
      {showDescription && (
        <span
          style={{
            fontSize: size === "sm" ? 10 : 11,
            color: "#595959",
            maxWidth: boxSize,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
          title={description}
        >
          {description}
        </span>
      )}
    </div>
  );
};

const defaultTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: "#8c8c8c",
  marginBottom: 8,
};

const FilePreview = ({
  documents,
  jwt,
  titleStyle,
  title = "Dateien",
  size = "md",
  showDescription = true,
}: FilePreviewProps) => {
  if (!documents || documents.length === 0) {
    return (
      <div>
        <div style={{ ...defaultTitleStyle, ...titleStyle }}>{title}</div>
        <div
          style={{
            color: "#8c8c8c",
            fontSize: 13,
            padding: "16px 0",
          }}
        >
          Keine Dateien vorhanden
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...defaultTitleStyle, ...titleStyle }}>{title}</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        {documents.map((doc, index) => (
          <FileItem
            key={doc.dms_url?.url?.object_name || doc.dms_url?.id || index}
            doc={doc}
            jwt={jwt}
            size={size}
            showDescription={showDescription}
          />
        ))}
      </div>
    </div>
  );
};

export default FilePreview;
