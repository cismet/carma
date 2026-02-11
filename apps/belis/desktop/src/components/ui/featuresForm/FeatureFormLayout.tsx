import { useEffect, useState, ReactNode } from "react";
import { Tabs } from "antd";
import type { UploadFile } from "antd";
import FormHeader from "./FormHeader";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";

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
}: FeatureFormLayoutProps) => {
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
  const documentsContent = (
    <DocumentPreview
      documents={documents}
      jwt={jwt}
      onFilesChange={onFilesChange}
      pendingFiles={pendingFiles}
      dokumenteTitleStyle={labelStyle}
      vorschauTitleStyle={labelStyle}
    />
  );

  // Wide screen: two-column layout (form left, documents right)
  if (isWideScreen) {
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
          <div className="w-3/5 min-w-[400px] px-6 py-4 overflow-y-auto border-r border-gray-100">
            {children}
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
    <div className="bg-white rounded-xl border border-gray-100 max-w-4xl w-full h-full flex flex-col">
      <FormHeader
        title={title}
        subtitle={subtitle}
        onCancel={onCancel}
        onSave={onSave}
      />
      <div className="px-6 py-4 pb-60 overflow-y-auto flex-1">
        <Tabs
          defaultActiveKey="general"
          items={[
            {
              key: "general",
              label: <span>Allgemein</span>,
              children: children,
            },
            {
              key: "documents",
              label: <span>Dokumente</span>,
              children: documentsContent,
            },
          ]}
        />
      </div>
    </div>
  );
};

export default FeatureFormLayout;
