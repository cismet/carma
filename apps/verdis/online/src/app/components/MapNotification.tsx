import { Alert } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

interface MapNotificationProps {
  variant: "danger" | "warning" | "info" | "success";
  onClose: () => void;
  children: ReactNode;
  // collapsed height; longer content gets a "mehr anzeigen" toggle
  maxHeight?: number;
  style?: CSSProperties;
}

const fadeOut = "linear-gradient(to bottom, black 55%, transparent 100%)";

const MapNotification = ({
  variant,
  onClose,
  children,
  maxHeight,
  style,
}: MapNotificationProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const compact = maxHeight !== undefined;

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || !compact) return;
    const measure = () => setOverflows(el.scrollHeight > maxHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, maxHeight, children]);

  const collapsed = compact && overflows && !expanded;

  let contentStyle: CSSProperties | undefined;
  if (collapsed) {
    contentStyle = {
      maxHeight,
      overflow: "hidden",
      maskImage: fadeOut,
      WebkitMaskImage: fadeOut,
    };
  } else if (compact && expanded) {
    contentStyle = { maxHeight: "50vh", overflowY: "auto" };
  }

  return (
    <Alert
      variant={variant}
      dismissible
      onClose={onClose}
      style={{
        ...(compact && { marginBottom: 0, padding: "8px 40px 8px 12px" }),
        ...style,
      }}
    >
      <div style={contentStyle}>
        <div ref={contentRef}>{children}</div>
      </div>
      {compact && overflows && (
        <button
          type="button"
          className="btn btn-link alert-link"
          title={expanded ? "weniger anzeigen" : "mehr anzeigen"}
          aria-label={expanded ? "weniger anzeigen" : "mehr anzeigen"}
          aria-expanded={expanded}
          style={{ display: "block", margin: "2px auto 0", padding: "0 12px" }}
          onClick={() => setExpanded((e) => !e)}
        >
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} />
        </button>
      )}
    </Alert>
  );
};

export default MapNotification;
