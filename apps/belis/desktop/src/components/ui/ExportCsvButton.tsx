import { useState } from "react";
import { DownloadOutlined, LoadingOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useSelector } from "react-redux";
import type { SidebarFeature } from "./BelisSidebar";
import {
  exportFeaturesToCsvByType,
  isCsvExportable,
} from "../../utils/csvExport";
import { fetchFeaturesForExport } from "../../helper/fetchFeaturesForExport";
import { getJWT } from "../../store/slices/auth";
import { getCsvExportSettings } from "../../store/slices/csvExportSettings";

interface ExportCsvButtonProps {
  features: SidebarFeature[];
}

const ExportCsvButton = ({ features }: ExportCsvButtonProps) => {
  const jwt = useSelector(getJWT);
  const settings = useSelector(getCsvExportSettings);
  const [loading, setLoading] = useState(false);
  // Only features that actually produce a file count. If a selection is all
  // skipped types, the export would create nothing, so the button stays disabled.
  const exportableCount = features.filter((f) =>
    isCsvExportable(f, settings)
  ).length;
  const enabled = exportableCount > 0 && !loading;

  const handleExport = async () => {
    setLoading(true);
    try {
      // Highlighted features carry only tile properties; fetch the full
      // attribute set by id before building the CSV.
      const enriched = jwt
        ? await fetchFeaturesForExport(features, jwt)
        : features;
      exportFeaturesToCsvByType(enriched, settings);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title="Markierte Objekte als CSV exportieren">
      <button
        onClick={handleExport}
        disabled={!enabled}
        className={`flex items-center justify-center w-8 h-8 rounded border ${
          enabled
            ? "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
            : "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
        }`}
      >
        {loading ? <LoadingOutlined /> : <DownloadOutlined />}
      </button>
    </Tooltip>
  );
};

export default ExportCsvButton;
