import { useState } from "react";
import type { UploadFile } from "antd";
import { Tabs } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import DocumentPreview from "../DocumentPreview";
import FormHeader from "./FormHeader";

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
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const jwt = useSelector(getJWT);

  // Support both regular query params and hash-based routing (/#/?param=value)
  const hashQuery = window.location.hash.split("?")[1] || "";
  const showRaw =
    new URLSearchParams(hashQuery || window.location.search).get("showRaw") ===
    "true";

  // Extract documents from abzweigdose[0].dokumenteArray
  const abzweigdoseData = data as Record<string, unknown>;
  const abzweigdoseArray = abzweigdoseData?.abzweigdose as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (abzweigdoseArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

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
      <DocumentPreview
        documents={documents}
        jwt={jwt}
        onFilesChange={setPendingFiles}
        pendingFiles={pendingFiles}
        dokumenteTitleStyle={labelStyle}
        vorschauTitleStyle={labelStyle}
      />
    </div>
  );

  // Debug content (only shown when ?showRaw=true)
  const debugContent = (
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
      {JSON.stringify(data, null, 2)}
    </pre>
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
