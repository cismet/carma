import { DownOutlined, SettingOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import {
  ACTIVE_ACCENT_COLOR,
  INACTIVE_ICON_COLOR,
  LAYER_BUTTON_SHADOW,
  TOOL_BUTTON_SIZE_PX,
} from "../shared";

type AnnotationToolOptionsToggleButtonProps = {
  collapsed: boolean;
  onClick: () => void;
};

export function AnnotationToolOptionsToggleButton({
  collapsed,
  onClick,
}: AnnotationToolOptionsToggleButtonProps) {
  const title = collapsed
    ? "Werkzeugoptionen anzeigen"
    : "Werkzeugoptionen ausblenden";
  const expanded = !collapsed;

  return (
    <Tooltip title={title}>
      <button
        type="button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          height: TOOL_BUTTON_SIZE_PX,
          minWidth: 44,
          padding: "0 10px",
          borderRadius: 8,
          border: expanded
            ? `1px solid rgba(22, 119, 255, 0.5)`
            : "1px solid #d1d5db",
          backgroundColor: expanded ? "#ffffff" : "#f9fafb",
          color: expanded ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
          boxShadow: expanded ? LAYER_BUTTON_SHADOW : "none",
          cursor: "pointer",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
        onClick={onClick}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        aria-label={title}
        data-test-id="measurement-secondary-toolbar-toggle"
      >
        <SettingOutlined />
        <DownOutlined
          style={{
            fontSize: 10,
            transition: "transform 0.15s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
    </Tooltip>
  );
}
