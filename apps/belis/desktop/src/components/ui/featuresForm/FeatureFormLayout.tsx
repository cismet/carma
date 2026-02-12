import { useEffect, useState, ReactNode } from "react";
import { Tabs } from "antd";
import type { UploadFile } from "antd";
import FormHeader from "./FormHeader";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";
import FilePreview from "../FilePreview";

interface AdditionalTab {
  key: string;
  label: string;
  children: ReactNode;
}

interface FeatureFormLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  documents?: DokumentItem[];
  jwt?: string | null;
  pendingFiles?: UploadFile[];
  onFilesChange?: (files: UploadFile[]) => void;
  onCancel?: () => void;
  onSave?: () => void;
  debugData?: unknown;
  additionalTabs?: AdditionalTab[];
  uploadText?: string;
}

const FeatureFormLayout = ({
  title,
  subtitle,
  children,
  documents = [],
  jwt,
  pendingFiles = [],
  onFilesChange,
  onCancel,
  onSave,
  debugData,
  additionalTabs = [],
  uploadText,
}: FeatureFormLayoutProps) => {
  // Support both regular query params and hash-based routing (/#/?param=value)
  const hashQuery = window.location.hash.split("?")[1] || "";
  const showRaw =
    new URLSearchParams(hashQuery || window.location.search).get("showRaw") ===
    "true";
  const [isWideScreen, setIsWideScreen] = useState(
    typeof window !== "undefined" ? window.innerWidth > 1200 : false
  );

  // Listen for window resize to toggle layout
  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1300);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
  const documentsContent = (
    <FilePreview
      documents={documents}
      jwt={jwt}
      titleStyle={labelStyle}
      title="Dokumente"
      size="xl"
      showDescription={false}
    />
  );

  // Debug content (only shown when ?showRaw=true)
  const debugContent = debugData ? (
    <pre
      style={{
        fontSize: 11,
        lineHeight: 1.5,
        background: "#f5f5f5",
        padding: 12,
        borderRadius: 4,
        overflow: "auto",
        maxHeight: 3000,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(debugData, null, 2)}
    </pre>
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
