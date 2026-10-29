import { useState } from "react";
import { DownloadOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Tooltip, message } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { getSelectedAAId } from "../../store/slices/arbeitsauftraege";
import { exportArbeitsauftraegeCsv } from "../../helper/exportArbeitsauftraegeCsv";
import { AA_SORT_BY_NUMMER_ASC } from "../../helper/aaSortHelpers";
import { useVisibleAAFeatures } from "../../hooks/useVisibleAAFeatures";

interface ExportAACsvButtonProps {
  // With the Datenblatt open, only the selected AA is exported.
  onlySelected?: boolean;
}

// Same sort as the sidebar list (BelisMapWrapper).
const ExportAACsvButton = ({ onlySelected }: ExportAACsvButtonProps) => {
  const visibleIds = useVisibleAAFeatures(AA_SORT_BY_NUMMER_ASC).map(
    (f) => f.id
  );
  const selectedAAId = useSelector(getSelectedAAId);
  const aaIds = onlySelected
    ? selectedAAId != null
      ? [selectedAAId]
      : []
    : visibleIds;
  const jwt = useSelector(getJWT);
  const [loading, setLoading] = useState(false);
  const enabled = aaIds.length > 0 && !!jwt && !loading;

  const handleExport = async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      await exportArbeitsauftraegeCsv(aaIds, jwt);
    } catch (e) {
      console.error("AA CSV export failed", e);
      void message.error("CSV-Export fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip
      title={
        onlySelected
          ? "Ausgewählten Arbeitsauftrag als CSV exportieren"
          : "Sichtbare Arbeitsaufträge als CSV exportieren"
      }
    >
      <Button
        icon={loading ? <LoadingOutlined /> : <DownloadOutlined />}
        size="small"
        disabled={!enabled}
        onClick={handleExport}
      />
    </Tooltip>
  );
};

export default ExportAACsvButton;
