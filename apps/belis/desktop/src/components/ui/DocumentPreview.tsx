import { useState, useEffect } from "react";
import { Row, Col, List, Spin, Popconfirm } from "antd";
import type { UploadFile } from "antd";
import {
  FilePdfOutlined,
  FileImageOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  getDocumentBlobUrl,
  downloadDocument,
} from "../../helper/documentHelper";
import DocumentUploader from "./DocumentUploader";

const TOTAL_HEIGHT = 330; // Fixed height for both columns

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
  onFilesChange?: (files: UploadFile[]) => void;
  pendingFiles?: UploadFile[];
  onRemoveDocument?: (doc: DokumentItem) => void;
  isSaving?: boolean;
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

// Helper to get unique identifier for a document (handles id: -1 case)
const getDocumentKey = (doc: DokumentItem) => {
  // Prefer url.object_name as it's unique, fallback to description or id
  return (
    doc.dms_url?.url?.object_name || doc.dms_url?.description || doc.dms_url?.id
  );
};

const DocumentPreview = ({
  documents,
  jwt,
  onFilesChange,
  pendingFiles,
  onRemoveDocument,
  isSaving = false,
}: DocumentPreviewProps) => {
  const [selectedDoc, setSelectedDoc] = useState<DokumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear selectedDoc if it's no longer in the documents list
  useEffect(() => {
    if (selectedDoc) {
      const selectedKey = getDocumentKey(selectedDoc);
      const stillExists = documents.some(
        (doc) => getDocumentKey(doc) === selectedKey
      );
      if (!stillExists) {
        setSelectedDoc(null);
      }
    }
  }, [documents, selectedDoc]);

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

  const handleDownload = async (doc: DokumentItem, e: React.MouseEvent) => {
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

  const handleRemove = (doc: DokumentItem) => {
    if (selectedDoc && getDocumentKey(selectedDoc) === getDocumentKey(doc)) {
      setSelectedDoc(null);
    }
    onRemoveDocument?.(doc);
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
            marginLeft: "2px",
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
    <Spin spinning={isSaving} indicator={<LoadingOutlined />}>
      <Row gutter={24} style={{ height: TOTAL_HEIGHT }}>
        <Col span={12} style={{ height: "100%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: "#8c8c8c",
                marginBottom: 8,
              }}
            >
              Dokumente
            </div>
            <List
              size="small"
              bordered
              dataSource={hasDocuments ? documents : []}
              locale={{ emptyText: "Keine Dokumente" }}
              style={{ maxHeight: 150, overflowY: "auto", flexShrink: 0 }}
              renderItem={(doc) => {
                const objectName = doc.dms_url?.url?.object_name || "";
                const isSelected = selectedDoc === doc;
                return (
                  <List.Item
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSelected ? "#e6f7ff" : undefined,
                      borderLeft: isSelected
                        ? "3px solid #1890ff"
                        : "3px solid transparent",
                      padding: "10px",
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {getFileIcon(objectName)}
                        <span style={{ fontSize: 13 }}>
                          {doc.dms_url?.description ||
                            doc.dms_url?.url?.object_name ||
                            "Dokument"}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <DownloadOutlined
                          style={{ color: "#8c8c8c", fontSize: 12 }}
                          onClick={(e) => handleDownload(doc, e)}
                        />
                        <Popconfirm
                          title="Dokument entfernen?"
                          onConfirm={() => handleRemove(doc)}
                          okText="Ja"
                          cancelText="Nein"
                        >
                          <DeleteOutlined
                            style={{ color: "#8c8c8c", fontSize: 12 }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Popconfirm>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
            <div style={{ marginTop: 16, flex: 1, minHeight: 80 }}>
              <DocumentUploader
                onFilesChange={onFilesChange}
                fileList={pendingFiles}
              />
            </div>
          </div>
        </Col>
        <Col span={12} style={{ height: "100%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: "#8c8c8c",
                marginBottom: 8,
                marginLeft: 2,
              }}
            >
              Vorschau
            </div>
            <div style={{ flex: 1 }}>{renderPreview()}</div>
          </div>
        </Col>
      </Row>
    </Spin>
  );
};

export default DocumentPreview;
