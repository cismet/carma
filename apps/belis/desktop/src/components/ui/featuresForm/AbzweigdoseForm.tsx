import { Tabs } from "antd";
import { useSelector } from "react-redux";
import { useState, useEffect, useMemo } from "react";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FilePreview, { SavedImageUrls, getFileType } from "../FilePreview";
import FormHeader from "./FormHeader";
import RawDisplay from "../RawDisplay";
import { getDocumentBlobUrl } from "../../../helper/documentHelper";

interface AbzweigdoseFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
}

const AbzweigdoseForm = ({
  data,
  rawFeature,
  onClose,
}: AbzweigdoseFormProps) => {
  const jwt = useSelector(getJWT);

  // Support both regular query params and hash-based routing (/#/?param=value)
  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    return (
      new URLSearchParams(hashQuery || window.location.search).get(
        "showRaw"
      ) === "true"
    );
  }, []);

  // Extract documents from abzweigdose[0].dokumenteArray
  const abzweigdoseData = data as Record<string, unknown>;
  const abzweigdoseArray = abzweigdoseData?.abzweigdose as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (abzweigdoseArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Cache image URLs at this level to persist across layout changes
  const [savedImageUrls, setSavedImageUrls] = useState<SavedImageUrls>({});

  // Memoize image documents
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

  // Fetch all image URLs and cache them
  useEffect(() => {
    if (!jwt || imageDocuments.length === 0) return;

    const fetchAllImages = async () => {
      const newUrls: SavedImageUrls = {};
      let hasNewUrls = false;

      for (const doc of imageDocuments) {
        const objectName = doc.dms_url?.url?.object_name;
        if (!objectName) continue;

        if (savedImageUrls[objectName]) {
          newUrls[objectName] = savedImageUrls[objectName];
          continue;
        }

        try {
          const url = await getDocumentBlobUrl(jwt, objectName);
          newUrls[objectName] = url;
          hasNewUrls = true;
        } catch (err) {
          console.error("Failed to load image:", err);
        }
      }

      if (hasNewUrls) {
        setSavedImageUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };

    fetchAllImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt, imageDocumentsKey]);

  // Extract subtitle
  const subtitle = "Nur Dokumente verfügbar";

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewahlt
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 8,
  };

  // Documents content - constrained width to prevent oversized preview
  const documentsContent = (
    <div style={{ maxWidth: 700 }}>
      <FilePreview
        documents={documents}
        jwt={jwt}
        titleStyle={labelStyle}
        title=""
        size="xl"
        showDescription={false}
        savedImageUrls={savedImageUrls}
      />
    </div>
  );

  // Debug content (only shown when ?showRaw=true)
  const debugContent = (
    <RawDisplay>{JSON.stringify(data, null, 2)}</RawDisplay>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 w-full h-full flex flex-col">
      <FormHeader title="Abzweigdose / Zugkasten" subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showRaw ? (
          <Tabs
            defaultActiveKey="documents"
            items={[
              {
                key: "documents",
                label: <span>Dokumente</span>,
                children: documentsContent,
              },
              {
                key: "debug",
                label: <span>Rohdaten</span>,
                children: debugContent,
              },
            ]}
          />
        ) : (
          documentsContent
        )}
      </div>
    </div>
  );
};

export default AbzweigdoseForm;
