import { useEffect, useState, ReactNode, useMemo } from "react";
import { Tabs } from "antd";
import type { UploadFile } from "antd";
import FormHeader from "./FormHeader";
import { DokumentItem } from "../DocumentPreview";
import FilePreview, { SavedImageUrls, getFileType } from "../FilePreview";
import { getDocumentBlobUrl } from "../../../helper/documentHelper";
import RawDisplay from "../RawDisplay";

interface AdditionalTab {
  key: string;
  label: string;
  children: ReactNode;
}

export interface ExtraDocumentSection {
  title: string;
  documents: DokumentItem[];
}

interface FeatureFormLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  documents?: DokumentItem[];
  mainDocumentsTitle?: string;
  extraDocumentSections?: ExtraDocumentSection[];
  jwt?: string | null;
  pendingFiles?: UploadFile[];
  onFilesChange?: (files: UploadFile[]) => void;
  onCancel?: () => void;
  onSave?: () => void;
  debugData?: unknown;
  additionalTabs?: AdditionalTab[];
  uploadText?: string;
  loading?: boolean;
}

const FeatureFormLayout = ({
  title,
  subtitle,
  children,
  documents = [],
  mainDocumentsTitle = "Dateien",
  extraDocumentSections = [],
  jwt,
  onCancel,
  onSave,
  debugData,
  additionalTabs = [],
  loading,
}: FeatureFormLayoutProps) => {
  // Support both regular query params and hash-based routing (/#/?param=value)
  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    return (
      new URLSearchParams(hashQuery || window.location.search).get(
        "showRaw"
      ) === "true"
    );
  }, []);
  const [isWideScreen, setIsWideScreen] = useState(
    typeof window !== "undefined" ? window.innerWidth > 1200 : false
  );

  // Cache image URLs at this level to persist across layout changes (resize)
  const [savedImageUrls, setSavedImageUrls] = useState<SavedImageUrls>({});

  // Listen for window resize to toggle layout
  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1300);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Combine main + extra documents for image pre-fetching
  const allDocumentsForImages = useMemo(
    () => [...documents, ...extraDocumentSections.flatMap((s) => s.documents)],
    [documents, extraDocumentSections]
  );

  // Memoize image documents to avoid recreating the array on every render
  const imageDocuments = useMemo(
    () =>
      allDocumentsForImages.filter((doc) => {
        const objectName = doc.dms_url?.url?.object_name || "";
        return getFileType(objectName) === "image";
      }),
    [allDocumentsForImages]
  );

  // All lightbox-compatible docs (images + PDFs) across every section, each
  // tagged with its section title so the lightbox can show it top-left per slide.
  const allLightboxDocuments = useMemo(() => {
    const canShowInLightbox = (doc: DokumentItem) => {
      const ft = getFileType(doc.dms_url?.url?.object_name || "");
      return ft === "image" || ft === "pdf";
    };
    return [
      ...documents.filter(canShowInLightbox).map((doc) => ({
        doc,
        sectionTitle: mainDocumentsTitle,
      })),
      ...extraDocumentSections.flatMap((section) =>
        section.documents.filter(canShowInLightbox).map((doc) => ({
          doc,
          sectionTitle: section.title,
        }))
      ),
    ];
  }, [documents, extraDocumentSections, mainDocumentsTitle]);

  // Create a stable key for dependency tracking
  const imageDocumentsKey = useMemo(
    () =>
      imageDocuments
        .map((doc) => doc.dms_url?.url?.object_name || "")
        .join(","),
    [imageDocuments]
  );

  // Fetch all image URLs and cache them at this level
  useEffect(() => {
    if (!jwt || imageDocuments.length === 0) return;

    const fetchAllImages = async () => {
      const newUrls: SavedImageUrls = {};
      let hasNewUrls = false;

      for (const doc of imageDocuments) {
        const objectName = doc.dms_url?.url?.object_name;
        if (!objectName) continue;

        // Skip if already cached
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

  // Label style matching FormLabel: text-sm font-medium text-gray-700
  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 8,
  };

  // Documents content
  // const documentsContent = (
  //   <DocumentPreview
  //     documents={documents}
  //     jwt={jwt}
  //     onFilesChange={onFilesChange}
  //     pendingFiles={pendingFiles}
  //     dokumenteTitleStyle={labelStyle}
  //     vorschauTitleStyle={labelStyle}
  //     uploadText={uploadText}
  //   />
  // );
  const hasAnyDocuments =
    documents.length > 0 ||
    extraDocumentSections.some((s) => s.documents.length > 0);

  const documentsContent = (
    <div className="flex flex-col gap-4">
      {!hasAnyDocuments ? (
        <div>
          <div style={{ ...labelStyle }}>{mainDocumentsTitle}</div>
          <div style={{ color: "#8c8c8c", fontSize: 13, padding: "16px 0" }}>
            Keine Dateien vorhanden
          </div>
        </div>
      ) : (
        <>
          {documents.length > 0 && (
            <FilePreview
              documents={documents}
              jwt={jwt}
              titleStyle={labelStyle}
              title={mainDocumentsTitle}
              size="xl"
              showDescription={false}
              savedImageUrls={savedImageUrls}
              allLightboxDocuments={allLightboxDocuments}
            />
          )}
          {extraDocumentSections
            .filter((s) => s.documents.length > 0)
            .map((section) => (
              <FilePreview
                key={section.title}
                documents={section.documents}
                jwt={jwt}
                titleStyle={labelStyle}
                title={section.title}
                size="xl"
                showDescription={false}
                savedImageUrls={savedImageUrls}
                allLightboxDocuments={allLightboxDocuments}
              />
            ))}
        </>
      )}
    </div>
  );

  // Debug content (only shown when ?showRaw=true)
  const debugContent = debugData ? (
    <RawDisplay>{JSON.stringify(debugData, null, 2)}</RawDisplay>
  ) : null;

  // Wide screen: two-column layout (form left, documents right)
  if (isWideScreen) {
    // Build tabs for the left column - Allgemein first, then additional tabs, then Rohdaten
    const leftColumnTabs = [
      {
        key: "general",
        label: <span>Allgemein</span>,
        children: children,
      },
      ...additionalTabs.map((tab) => ({
        key: tab.key,
        label: <span>{tab.label}</span>,
        children: tab.children,
      })),
      ...(showRaw
        ? [
            {
              key: "debug",
              label: <span>Rohdaten</span>,
              children: debugContent,
            },
          ]
        : []),
    ];

    return (
      <div className="bg-white rounded-xl border border-gray-100 w-full h-full flex flex-col">
        <FormHeader
          title={title}
          subtitle={subtitle}
          onCancel={onCancel}
          onSave={onSave}
          loading={loading}
        />
        <div className="flex flex-1 overflow-hidden">
          {/* Form column - 60% */}
          <div className="w-3/5 min-w-[400px] px-6 pb-4 overflow-y-auto border-r border-gray-100">
            {showRaw || additionalTabs.length > 0 ? (
              <div className="[&_.ant-tabs-nav]:sticky [&_.ant-tabs-nav]:top-0 [&_.ant-tabs-nav]:bg-white [&_.ant-tabs-nav]:z-10">
                <Tabs defaultActiveKey="general" items={leftColumnTabs} />
              </div>
            ) : (
              <div className="pt-4">{children}</div>
            )}
          </div>
          {/* Documents column - 40% */}
          <div className="w-2/5 min-w-[480px] px-6 py-4 overflow-y-auto">
            {documentsContent}
          </div>
        </div>
      </div>
    );
  }

  // Narrow screen: tabbed layout
  return (
    <div className="bg-white rounded-xl border border-gray-100 max-w-4xl w-full h-full flex flex-col min-w-[350px]">
      <FormHeader
        title={title}
        subtitle={subtitle}
        onCancel={onCancel}
        onSave={onSave}
        loading={loading}
      />
      <div className="px-6 pb-60 overflow-y-auto flex-1">
        <div className="[&_.ant-tabs-nav]:sticky [&_.ant-tabs-nav]:top-0 [&_.ant-tabs-nav]:bg-white [&_.ant-tabs-nav]:z-10">
          <Tabs
            defaultActiveKey="general"
            items={[
              {
                key: "general",
                label: <span>Allgemein</span>,
                children: children,
              },
              ...additionalTabs.map((tab) => ({
                key: tab.key,
                label: <span>{tab.label}</span>,
                children: tab.children,
              })),
              {
                key: "documents",
                label: <span>Dokumente</span>,
                children: documentsContent,
              },
              ...(showRaw
                ? [
                    {
                      key: "debug",
                      label: <span>Rohdaten</span>,
                      children: debugContent,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  );
};

export default FeatureFormLayout;
