import { LockOutlined } from "@ant-design/icons";
import useSperre from "./useSperre";

const SperreBadge = () => {
  const { sperre, reason } = useSperre();

  if (!sperre) {
    return null;
  }
  return (
    <div
      className="flex items-center gap-2 h-8 rounded-md px-3"
      style={{
        border: "1px solid #ffe58f",
        background: "#fffbe6",
        maxWidth: 360,
      }}
      title={reason}
      data-test-id="sperre-badge"
    >
      <LockOutlined style={{ color: "#d48806" }} />
      {reason && (
        <span className="truncate text-xs text-gray-500">Grund: {reason}</span>
      )}
    </div>
  );
};

export default SperreBadge;
