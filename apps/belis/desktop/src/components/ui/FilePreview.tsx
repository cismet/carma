import { useState, useEffect, useContext, useMemo, useCallback } from "react";
import { Spin } from "antd";
import {
  FilePdfOutlined,
  FileOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import {
  getDocumentBlobUrl,
  getSecureDocumentUrl,
} from "../../helper/documentHelper";
import type { DokumentItem } from "./DocumentPreview";

interface LightBoxDispatch {
  setAll?: (data: {
    title: string;
    index: number;
    photourls: string[];
    caption: React.ReactNode[];
    visible: boolean;
  }) => void;
  setIndex?: (index: number) => void;
  setVisible?: (visible: boolean) => void;
  setCaptions?: (captions: React.ReactNode[]) => void;
}

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
  savedImageUrls?: SavedImageUrls;
  // All lightbox-compatible docs across all sections — enables unified sliding.
  // Each entry carries its section title shown in the top-left of the lightbox.
  allLightboxDocuments?: Array<{ doc: DokumentItem; sectionTitle: string }>;
}

type FileType = "image" | "pdf" | "other";

export const getFileType = (objectName: string): FileType => {
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
  onImageClick?: () => void;
  savedUrl?: string;
}

const FileItem = ({
  doc,
  jwt,
  size,
  showDescription,
  onImageClick,
  savedUrl,
}: FileItemProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(savedUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const { box: boxSize, icon: iconSize } = SIZE_MAP[size];
  const objectName = doc.dms_url?.url?.object_name || "";
  const fileType = getFileType(objectName);
  const description =
    doc.dms_url?.description || doc.dms_url?.url?.object_name || "Datei";

  // Update previewUrl if savedUrl changes (e.g., parent finished loading)
  useEffect(() => {
    if (savedUrl && !previewUrl) {
      setPreviewUrl(savedUrl);
    }
  }, [savedUrl, previewUrl]);

  useEffect(() => {
    // Skip fetching if we already have a URL (from cache or previous fetch)
    if (!jwt || !objectName || previewUrl) {
      return;
    }

    // Only fetch for images and PDFs
    if (fileType !== "image" && fileType !== "pdf") {
      return;
    }

    const fetchPreview = async () => {
      setLoading(true);
      setError(false);

      try {
        // For PDFs, fetch the thumbnail; for images, fetch the image itself
        const urlToFetch =
          fileType === "pdf" ? objectName + ".thumbnail.jpg" : objectName;
        const url = await getDocumentBlobUrl(jwt, urlToFetch);
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
      // Only revoke URLs that we created (not cached ones from parent)
      if (previewUrl && !savedUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [jwt, objectName, fileType, previewUrl, savedUrl]);

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
    // Handle other non-image/non-pdf files
    if (fileType !== "image" && fileType !== "pdf") {
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
      return (
        <div
          style={{
            ...boxStyle,
            cursor: onImageClick ? "pointer" : "default",
          }}
          onClick={onImageClick}
        >
          {getFileIcon(objectName, iconSize)}
        </div>
      );
    }

    // Show image/PDF thumbnail with optional PDF icon overlay
    return (
      <div style={{ position: "relative" }}>
        {fileType === "pdf" && (
          <FilePdfOutlined
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              zIndex: 10,
              fontSize: size === "sm" ? 16 : size === "md" ? 24 : 32,
              color: "#ff4d4f",
              opacity: 0.8,
              filter: "drop-shadow(0 0 2px white)",
            }}
          />
        )}
        <img
          src={previewUrl}
          alt={description}
          onClick={onImageClick}
          style={{
            width: boxSize,
            height: boxSize,
            objectFit: "cover",
            borderRadius: 4,
            border: "1px solid #d9d9d9",
            cursor: onImageClick ? "pointer" : "default",
          }}
        />
      </div>
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

export interface SavedImageUrls {
  [objectName: string]: string;
}

const FilePreview = ({
  documents,
  jwt,
  titleStyle,
  title = "Dateien",
  size = "md",
  showDescription = true,
  savedImageUrls = {},
  allLightboxDocuments,
}: FilePreviewProps) => {
  // Use cached URLs from parent - no local fetching needed
  const imageUrls = savedImageUrls;
  const lightBoxDispatch = useContext(
    LightBoxDispatchContext
  ) as LightBoxDispatch;

  // Memoize lightbox-compatible documents (images and PDFs) for this section
  const lightboxDocuments = useMemo(
    () =>
      documents.filter((doc) => {
        const objectName = doc.dms_url?.url?.object_name || "";
        const fileType = getFileType(objectName);
        return fileType === "image" || fileType === "pdf";
      }),
    [documents]
  );

  // When a unified allLightboxDocuments list is provided, find where this
  // section's first doc starts in that list so we can compute global indices.
  const globalLightboxOffset = useMemo(() => {
    if (!allLightboxDocuments || lightboxDocuments.length === 0) return 0;
    const firstObjectName = lightboxDocuments[0]?.dms_url?.url?.object_name;
    if (!firstObjectName) return 0;
    const idx = allLightboxDocuments.findIndex(
      (entry) => entry.doc.dms_url?.url?.object_name === firstObjectName
    );
    return idx >= 0 ? idx : 0;
  }, [allLightboxDocuments, lightboxDocuments]);

  // Handle image/PDF click - set up lightbox and show it
  const handleLightboxClick = useCallback(
    (clickedIndex: number) => {
      if (!lightBoxDispatch || !jwt) return;

      const globalIndex = allLightboxDocuments
        ? globalLightboxOffset + clickedIndex
        : clickedIndex;

      const photourls: string[] = [];
      const captions: React.ReactNode[] = [];

      if (allLightboxDocuments) {
        // Unified mode: iterate all sections; show section name top-left per slide
        for (const { doc, sectionTitle } of allLightboxDocuments) {
          const objectName = doc.dms_url?.url?.object_name || "";
          const fileType = getFileType(objectName);
          const description =
            doc.dms_url?.description || doc.dms_url?.url?.object_name || "Datei";

          const sectionLabel = (
            <span
              style={{
                position: "fixed",
                top: 58,
                left: 16,
                color: "#fff",
                fontSize: 16,
                fontWeight: 500,
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                zIndex: 1500,
              }}
            >
              {sectionTitle}
            </span>
          );

          if (fileType === "image") {
            photourls.push(getSecureDocumentUrl(jwt, objectName));
            captions.push(<div>{sectionLabel}{description}</div>);
          } else if (fileType === "pdf") {
            const pdfUrl = getSecureDocumentUrl(jwt, objectName);
            photourls.push(getSecureDocumentUrl(jwt, objectName + ".thumbnail.jpg"));
            captions.push(
              <div>
                {sectionLabel}
                {description}
                <span style={{ marginLeft: 30 }}>
                  <a href={pdfUrl} target="_pdf" rel="noopener noreferrer" style={{ color: "#1890ff" }}>
                    PDF extern öffnen
                  </a>
                </span>
              </div>
            );
          }
        }
      } else {
        // Single-section fallback — original behaviour, unchanged
        for (const doc of lightboxDocuments) {
          const objectName = doc.dms_url?.url?.object_name || "";
          const fileType = getFileType(objectName);
          const description =
            doc.dms_url?.description || doc.dms_url?.url?.object_name || "Datei";

          if (fileType === "image") {
            photourls.push(getSecureDocumentUrl(jwt, objectName));
            captions.push(description);
          } else if (fileType === "pdf") {
            const thumbnailUrl = getSecureDocumentUrl(jwt, objectName + ".thumbnail.jpg");
            const pdfUrl = getSecureDocumentUrl(jwt, objectName);
            photourls.push(thumbnailUrl);
            captions.push(
              <div>
                {description}
                <span style={{ marginLeft: 30 }}>
                  <a href={pdfUrl} target="_pdf" rel="noopener noreferrer" style={{ color: "#1890ff" }}>
                    PDF extern öffnen
                  </a>
                </span>
              </div>
            );
          }
        }
      }

      if (photourls.length > 0 && lightBoxDispatch.setAll) {
        lightBoxDispatch.setAll({
          title: "",
          index: globalIndex,
          photourls,
          caption: captions,
          visible: true,
        });
        if (lightBoxDispatch.setCaptions) {
          lightBoxDispatch.setCaptions(captions);
        }
      }
    },
    [allLightboxDocuments, lightboxDocuments, globalLightboxOffset, jwt, lightBoxDispatch]
  );

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

  // Build a map from objectName to lightbox index (images and PDFs)
  let lightboxIndex = 0;
  const objectNameToLightboxIndex: Record<string, number> = {};
  for (const doc of lightboxDocuments) {
    const objectName = doc.dms_url?.url?.object_name || "";
    const fileType = getFileType(objectName);
    if (fileType === "image" || fileType === "pdf") {
      objectNameToLightboxIndex[objectName] = lightboxIndex;
      lightboxIndex++;
    }
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
        {documents.map((doc, index) => {
          const objectName = doc.dms_url?.url?.object_name || "";
          const fileType = getFileType(objectName);
          const lbIndex = objectNameToLightboxIndex[objectName];

          return (
            <FileItem
              key={doc.dms_url?.url?.object_name || doc.dms_url?.id || index}
              doc={doc}
              jwt={jwt}
              size={size}
              showDescription={showDescription}
              savedUrl={imageUrls[objectName]}
              onImageClick={
                (fileType === "image" || fileType === "pdf") &&
                lbIndex !== undefined
                  ? () => handleLightboxClick(lbIndex)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
};

export default FilePreview;
