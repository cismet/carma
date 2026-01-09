import { useState, useEffect } from "react";
import { Row, Col, List, Spin } from "antd";
import {
  FilePdfOutlined,
  FileImageOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import {
  getDocumentBlobUrl,
  downloadDocument,
} from "../../helper/documentHelper";

interface DmsUrlInner {
  id: number;
  description: string;
  name: string | null;
  typ: string | null;
  url: {
    id: number;
    object_name: string;
    url_base?: {
      id: number;
      prot_prefix: string;
      server: string;
      path: string;
    };
  };
}

export interface DokumentItem {
  dms_url: DmsUrlInner;
}

interface DocumentPreviewProps {
  documents: DokumentItem[];
  jwt?: string;
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

const getFileIcon = (objectName: string) => {
  const fileType = getFileType(objectName);
  if (fileType === "image") {
    return <FileImageOutlined style={{ color: "#1890ff" }} />;
  }
  return <FilePdfOutlined style={{ color: "#ff4d4f" }} />;
};

const DocumentPreview = ({ documents, jwt }: DocumentPreviewProps) => {
  const [selectedDoc, setSelectedDoc] = useState<DokumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!selectedDoc || !jwt) {
      setPreviewUrl(null);
      return;
    }

    const objectName = selectedDoc.dms_url?.url?.object_name;
    if (!objectName) {
      setError("Dokument nicht verfügbar");
      return;
    }

    const fileType = getFileType(objectName);
    if (fileType === "other") {
      setPreviewUrl(null);
      setError("Vorschau für diesen Dateityp nicht verfügbar");
      return;
    }

    const fetchPreview = async () => {
      setLoading(true);
      setError(null);

      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }

      try {
        const url = await getDocumentBlobUrl(jwt, objectName);
        setPreviewUrl(url);
      } catch (err) {
        console.error("Failed to load preview:", err);
        setError("Vorschau konnte nicht geladen werden");
        setPreviewUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [selectedDoc, jwt]);

  const handleDownload = async (
    doc: DokumentItem,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const urlData = doc.dms_url?.url;
    if (urlData?.object_name && jwt) {
      try {
        await downloadDocument(
          jwt,
          urlData.object_name,
          doc.dms_url?.description || urlData.object_name
        );
      } catch (err) {
        console.error("Download failed:", err);
      }
    }
  };

  const renderPreview = () => {
    if (!selectedDoc) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#8c8c8c",
            backgroundColor: "#f5f5f5",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
          }}
        >
          Dokument auswählen
        </div>
      );
    }

    if (loading) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f5f5",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
          }}
        >
          <Spin tip="Laden..." />
        </div>
      );
    }

    if (error) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ff4d4f",
            backgroundColor: "#f5f5f5",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      );
    }

    if (!previewUrl) {
      return null;
    }

    const objectName = selectedDoc.dms_url?.url?.object_name || "";
    const fileType = getFileType(objectName);

    if (fileType === "image") {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f5f5",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <img
            src={previewUrl}
            alt={selectedDoc.dms_url?.description || "Dokument"}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      );
    }

    if (fileType === "pdf") {
      return (
        <iframe
          src={previewUrl}
          title={selectedDoc.dms_url?.description || "PDF Vorschau"}
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
          }}
        />
      );
    }

    return null;
  };

  const hasDocuments = documents && documents.length > 0;

  return (
    <Row gutter={16} style={{ minHeight: 200 }}>
      <Col span={10}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Dokumente</div>
        <List
          size="small"
          bordered
          dataSource={hasDocuments ? documents : []}
          locale={{ emptyText: "Keine Dokumente" }}
          style={{ maxHeight: 200, overflowY: "auto" }}
          renderItem={(doc) => {
            const objectName = doc.dms_url?.url?.object_name || "";
            const isSelected = selectedDoc === doc;
            return (
              <List.Item
                style={{
                  cursor: "pointer",
                  backgroundColor: isSelected ? "#e6f7ff" : undefined,
                  borderLeft: isSelected ? "3px solid #1890ff" : "3px solid transparent",
                }}
                className="hover:bg-gray-50"
                onClick={() => setSelectedDoc(doc)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {getFileIcon(objectName)}
                    <span style={{ fontSize: 13 }}>
                      {doc.dms_url?.description ||
                        doc.dms_url?.url?.object_name ||
                        "Dokument"}
                    </span>
                  </div>
                  <DownloadOutlined
                    style={{ color: "#8c8c8c" }}
                    onClick={(e) => handleDownload(doc, e)}
                  />
                </div>
              </List.Item>
            );
          }}
        />
      </Col>
      <Col span={14}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Vorschau</div>
        <div style={{ height: 200 }}>{renderPreview()}</div>
      </Col>
    </Row>
  );
};

export default DocumentPreview;
