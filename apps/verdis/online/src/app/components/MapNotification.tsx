import { Alert } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

interface MapNotificationProps {
  variant: "danger" | "warning" | "info" | "success";
  onClose: () => void;
  // one short line, always visible
  title?: ReactNode;
  // the long explanation; on compact screens only shown after a tap
  children?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
}

const iconButtonStyle: CSSProperties = {
  background: "none",
  border: 0,
  padding: "2px 6px",
  color: "inherit",
  opacity: 0.7,
  flexShrink: 0,
  lineHeight: 1,
};

const MapNotification = ({
  variant,
  onClose,
  title,
  children,
  compact = false,
  style,
}: MapNotificationProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    children !== undefined && children !== null && children !== false;
  const icon = variant === "danger" ? faExclamationTriangle : faInfoCircle;

  // mobile, title only: a round icon that opens into a one-line pill on tap
  if (compact && !hasDetails) {
    return (
      <button
        type="button"
        // alert colours, shape of the compact map attribution
        className={`alert-${variant}`}
        aria-label={expanded ? "Meldung ausblenden" : "Meldung anzeigen"}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: 0,
          height: 24,
          minWidth: 24,
          padding: expanded ? "0 4px 0 8px" : 0,
          justifyContent: "center",
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: 12,
          font: "12px/20px Helvetica Neue, Arial, Helvetica, sans-serif",
          pointerEvents: "auto",
          width: "fit-content",
          ...style,
        }}
      >
        {expanded && <span style={{ whiteSpace: "nowrap" }}>{title}</span>}
        <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
      </button>
    );
  }

  if (!compact) {
    return (
      <Alert variant={variant} dismissible onClose={onClose} style={style}>
        {title && (
          <div style={{ fontWeight: "bold", marginBottom: hasDetails ? 4 : 0 }}>
            {title}
          </div>
        )}
        {children}
      </Alert>
    );
  }

  const showDetails = hasDetails && expanded;
  const toggle = () => setExpanded((e) => !e);

  // collapsed it is only a round icon; the icon opens the full message
  return (
    <Alert
      variant={variant}
      style={{
        marginBottom: 0,
        padding: showDetails ? "6px 8px" : 0,
        ...(!showDetails && {
          width: 24,
          height: 24,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }),
        fontSize: 14,
        pointerEvents: "auto",
        ...(showDetails && { width: "fit-content" }),
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          style={{ ...iconButtonStyle, opacity: 1, fontSize: 12 }}
          aria-label={expanded ? "Meldung ausblenden" : "Meldung anzeigen"}
          aria-expanded={hasDetails ? expanded : undefined}
          disabled={!hasDetails}
          onClick={toggle}
        >
          <FontAwesomeIcon icon={icon} />
        </button>
      </div>
      {showDetails && (
        <div
          style={{
            marginTop: 6,
            maxHeight: "45vh",
            overflowY: "auto",
          }}
        >
          {title && (
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>{title}</div>
          )}
          {children}
        </div>
      )}
    </Alert>
  );
};

export default MapNotification;
