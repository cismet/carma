import { Alert } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEllipsisH,
  faExclamationTriangle,
  faInfoCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

interface StatusNotificationAction {
  label: string;
  onClick: () => void;
}

interface StatusNotificationProps {
  variant: "danger" | "warning" | "info" | "success";
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  action?: StatusNotificationAction;
  compact?: boolean;
  defaultExpanded?: boolean;
  style?: CSSProperties;
}

type CompactStage = "icon" | "summary" | "full";

const font = "13px/1.4 Helvetica Neue, Arial, Helvetica, sans-serif";
const shadow = "0 2px 8px rgba(0, 0, 0, 0.18)";

const plainButton: CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  margin: 0,
  color: "inherit",
  font: "inherit",
  lineHeight: 1,
};

const headerIconButton: CSSProperties = {
  ...plainButton,
  width: 28,
  height: 28,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.7,
};

const ActionButton = ({ action }: { action: StatusNotificationAction }) => (
  <button
    type="button"
    onClick={action.onClick}
    style={{
      ...plainButton,
      minHeight: 32,
      padding: "0 12px",
      borderRadius: 6,
      border: "1px solid currentColor",
      fontWeight: 500,
    }}
  >
    {action.label}
  </button>
);

const StatusNotification = ({
  variant,
  onClose,
  title,
  children,
  action,
  compact = false,
  defaultExpanded = false,
  style,
}: StatusNotificationProps) => {
  const [stage, setStage] = useState<CompactStage>(
    defaultExpanded ? "summary" : "icon"
  );
  const hasDetails =
    children !== undefined && children !== null && children !== false;
  const icon = variant === "danger" ? faExclamationTriangle : faInfoCircle;

  if (!compact) {
    return (
      <Alert
        variant={variant}
        dismissible={onClose !== undefined}
        onClose={onClose}
        style={style}
      >
        {title && (
          <div style={{ fontWeight: "bold", marginBottom: hasDetails ? 4 : 0 }}>
            {title}
          </div>
        )}
        {children}
      </Alert>
    );
  }

  const hasMore = hasDetails || action !== undefined;
  const surface: CSSProperties = {
    margin: 0,
    borderWidth: 1,
    borderStyle: "solid",
    boxShadow: shadow,
    font,
    pointerEvents: "auto",
  };

  if (stage === "icon") {
    return (
      <button
        type="button"
        className={`alert-${variant}`}
        aria-label="Meldung anzeigen"
        aria-expanded={false}
        onClick={() => setStage("summary")}
        style={{
          ...surface,
          boxShadow: "none",
          width: 24,
          height: 24,
          padding: 0,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
      </button>
    );
  }

  if (stage === "summary") {
    return (
      <button
        type="button"
        className={`alert-${variant}`}
        aria-label={hasMore ? "Ganze Meldung anzeigen" : "Meldung ausblenden"}
        aria-expanded={false}
        onClick={() => setStage(hasMore ? "full" : "icon")}
        style={{
          ...surface,
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 28,
          padding: "4px 12px 4px 10px",
          borderRadius: 14,
          width: "fit-content",
          maxWidth: "100%",
          textAlign: "left",
          ...style,
        }}
      >
        <FontAwesomeIcon icon={icon} style={{ fontSize: 13, flexShrink: 0 }} />
        <span
          style={{
            minWidth: 0,
            // without more content the title is the whole message, so let it wrap
            ...(hasMore && {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }),
          }}
        >
          {title}
        </span>
        {hasMore && (
          <FontAwesomeIcon
            icon={faEllipsisH}
            style={{ fontSize: 14, flexShrink: 0, opacity: 0.8 }}
          />
        )}
      </button>
    );
  }

  return (
    <div
      role="status"
      className={`alert-${variant}`}
      style={{
        ...surface,
        borderRadius: 8,
        padding: "6px 6px 12px 12px",
        width: "100%",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <FontAwesomeIcon
          icon={icon}
          style={{ fontSize: 13, flexShrink: 0, marginTop: 8 }}
        />
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            fontWeight: 700,
            paddingTop: 5,
          }}
        >
          {title}
        </div>
        <button
          type="button"
          style={headerIconButton}
          aria-label="Meldung einklappen"
          aria-expanded={true}
          onClick={() => setStage("icon")}
        >
          <FontAwesomeIcon icon={faTimes} style={{ fontSize: 15 }} />
        </button>
      </div>
      {hasDetails && (
        <div
          style={{
            margin: "6px 6px 0 21px",
            maxHeight: "45vh",
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      )}
      {action && (
        <div style={{ margin: "10px 6px 0 21px" }}>
          <ActionButton action={action} />
        </div>
      )}
    </div>
  );
};

export default StatusNotification;
