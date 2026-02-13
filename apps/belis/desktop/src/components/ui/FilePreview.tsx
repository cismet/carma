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
import { getDocumentBlobUrl } from "../../helper/documentHelper";
import type { DokumentItem } from "./DocumentPreview";

interface LightBoxDispatch {
  setAll?: (data: {
    title: string;
    index: number;
    photourls: string[];
    caption: string[];
    visible: boolean;
  }) => void;
  setIndex?: (index: number) => void;
  setVisible?: (visible: boolean) => void;
  setCaptions?: (captions: string[]) => void;
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
  onImageClick?: () => void;
}

const FileItem = ({
  doc,
  jwt,
  size,
  showDescription,
  onImageClick,
}: FileItemProps) => {
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

interface ImageUrlCache {
  [objectName: string]: string;
}

const FilePreview = ({
  documents,
  jwt,
  titleStyle,
  title = "Dateien",
  size = "md",
  showDescription = true,
}: FilePreviewProps) => {
  const [imageUrls, setImageUrls] = useState<ImageUrlCache>({});
  const lightBoxDispatch = useContext(
    LightBoxDispatchContext
  ) as LightBoxDispatch;

  // Memoize image documents to avoid recreating the array on every render
  const imageDocuments = useMemo(
    () =>
      documents.filter((doc) => {
        const objectName = doc.dms_url?.url?.object_name || "";
        return getFileType(objectName) === "image";
      }),
    [documents]
  );

  // Create a stable key for dependency tracking
  const imageDocumentsKey = useMemo(
    () =>
      imageDocuments
        .map((doc) => doc.dms_url?.url?.object_name || "")
        .join(","),
    [imageDocuments]
  );

  // Fetch all image URLs for the lightbox
  useEffect(() => {
    if (!jwt || imageDocuments.length === 0) return;

    const fetchAllImages = async () => {
      const newUrls: ImageUrlCache = {};
      let hasNewUrls = false;

      for (const doc of imageDocuments) {
        const objectName = doc.dms_url?.url?.object_name;
        if (!objectName) continue;

        // Skip if already loaded
        if (imageUrls[objectName]) {
          newUrls[objectName] = imageUrls[objectName];
          continue;
        }

        try {
          const url = await getDocumentBlobUrl(jwt, objectName);
          newUrls[objectName] = url;
          hasNewUrls = true;
        } catch (err) {
          console.error("Failed to load image for lightbox:", err);
        }
      }

      if (hasNewUrls) {
        setImageUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };

    fetchAllImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt, imageDocumentsKey]);

  // Handle image click - set up lightbox and show it
  const handleImageClick = useCallback(
    (clickedIndex: number) => {
      if (!lightBoxDispatch) return;

      // Build photo URLs and captions at click time
      const photourls: string[] = [];
      const captions: string[] = [];

      for (const doc of imageDocuments) {
        const objectName = doc.dms_url?.url?.object_name || "";
        const url = imageUrls[objectName];
        if (url) {
          photourls.push(url);
          captions.push(
            doc.dms_url?.description || doc.dms_url?.url?.object_name || "Datei"
          );
        }
      }

      if (photourls.length > 0 && lightBoxDispatch.setAll) {
        lightBoxDispatch.setAll({
          title: title,
          index: clickedIndex,
          photourls,
          caption: captions,
          visible: true,
        });
        // Also call setCaptions separately (required for caption updates when navigating)
        lightBoxDispatch.setCaptions?.(captions);
      }
    },
    [imageDocuments, imageUrls, title, lightBoxDispatch]
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

  // Build a map from objectName to lightbox index (only images with loaded URLs)
  let lightboxIndex = 0;
  const objectNameToLightboxIndex: Record<string, number> = {};
  for (const doc of imageDocuments) {
    const objectName = doc.dms_url?.url?.object_name || "";
    if (imageUrls[objectName]) {
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
              onImageClick={
                fileType === "image" && lbIndex !== undefined
                  ? () => handleImageClick(lbIndex)
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
