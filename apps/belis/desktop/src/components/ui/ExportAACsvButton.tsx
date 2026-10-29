import { useState } from "react";
import { DownloadOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Tooltip, message } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { exportArbeitsauftraegeCsv } from "../../helper/exportArbeitsauftraegeCsv";
import { AA_SORT_BY_NUMMER_ASC } from "../../helper/aaSortHelpers";
import { useVisibleAAFeatures } from "../../hooks/useVisibleAAFeatures";

// Same sort as the sidebar list (BelisMapWrapper).
const ExportAACsvButton = () => {
  const aaIds = useVisibleAAFeatures(AA_SORT_BY_NUMMER_ASC).map((f) => f.id);
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
    <Tooltip title="Sichtbare Arbeitsaufträge als CSV exportieren">
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
