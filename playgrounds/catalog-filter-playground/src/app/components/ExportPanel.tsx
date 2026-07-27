import { useMemo, useState } from "react";
import { Button, message, Segmented } from "antd";
import { CopyOutlined } from "@ant-design/icons";

import type { CatalogFilters } from "@carma-mapping/layers";

import {
  toWorkflowPerspectives,
  type PerspectiveDraft,
  type RouteDraft,
} from "../model";
import {
  buildJsonExport,
  buildTypeScriptExport,
} from "../helper/exportSnippets";

type ExportFormat = "ts" | "json";

interface ExportPanelProps {
  route: RouteDraft;
  filters: CatalogFilters;
  perspectives: PerspectiveDraft[];
}

const ExportPanel = ({ route, filters, perspectives }: ExportPanelProps) => {
  const [format, setFormat] = useState<ExportFormat>("ts");

  const workflowPerspectives = useMemo(
    () => toWorkflowPerspectives(perspectives),
    [perspectives]
  );

  const snippet = useMemo(
    () =>
      format === "ts"
        ? buildTypeScriptExport(route, filters, workflowPerspectives)
        : buildJsonExport(route, filters, workflowPerspectives),
    [format, route, filters, workflowPerspectives]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      message.success("Export kopiert");
    } catch (error) {
      console.error("[FILTER PLAYGROUND] copy failed", error);
      message.error("Kopieren fehlgeschlagen");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="small"
          value={format}
          onChange={(value) => setFormat(value as ExportFormat)}
          options={[
            { label: "TypeScript", value: "ts" },
            { label: "JSON", value: "json" },
          ]}
        />
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
          Kopieren
        </Button>
      </div>
      <pre className="bg-gray-900 text-gray-100 text-[11px] leading-4 p-3 rounded-md overflow-auto max-h-72 mb-0">
        {snippet}
      </pre>
    </div>
  );
};

export default ExportPanel;
