import { Badge, Tooltip } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { getDraftFeaturesCount } from "../../store/slices/featuresForms";

const DraftsBadge = () => {
  const draftsCount = useSelector(getDraftFeaturesCount);

  if (draftsCount <= 0) return null;

  return (
    <Tooltip title={`Nicht gespeicherte Änderungen (${draftsCount})`}>
      <Badge
        count={draftsCount}
        size="default"
        offset={[-3, -3]}
        style={{ backgroundColor: "#faad14" }}
      >
        <span className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-white">
          <EditOutlined style={{ color: "#6b7280", fontSize: 14 }} />
        </span>
      </Badge>
    </Tooltip>
  );
};

export default DraftsBadge;
