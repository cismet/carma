import { SettingOutlined } from "@ant-design/icons";
import { Switch, Tooltip } from "antd";
import { annotationTooltipProps } from "../../shared/annotationTooltip";
import { ACTIVE_ACCENT_COLOR, INACTIVE_ICON_COLOR } from "../shared";

type AnnotationToolOptionsToggleButtonProps = {
  collapsed: boolean;
  onClick: () => void;
  disabled?: boolean;
};

export function AnnotationToolOptionsToggleButton({
  collapsed,
  onClick,
  disabled = false,
}: AnnotationToolOptionsToggleButtonProps) {
  const title = collapsed
    ? "Werkzeugoptionen anzeigen"
    : "Werkzeugoptionen ausblenden";
  const expanded = !collapsed;

  return (
    <Tooltip {...annotationTooltipProps} title={title}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "auto",
          height: 20,
          padding: 0,
          color: expanded ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
          transition: "all 0.15s ease",
          flexShrink: 0,
          opacity: disabled ? 0.45 : 1,
        }}
        data-test-id="measurement-secondary-toolbar-toggle"
      >
        <SettingOutlined
          style={{
            fontSize: 14,
            color: expanded ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
          }}
        />
        <Switch
          size="small"
          checked={expanded}
          checkedChildren={null}
          unCheckedChildren={null}
          disabled={disabled}
          onChange={() => onClick()}
          aria-label={title}
        />
      </span>
    </Tooltip>
  );
}
