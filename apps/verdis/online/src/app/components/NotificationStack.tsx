import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export interface StackItem {
  key: string;
  variant: "danger" | "warning" | "info" | "success";
  node: ReactNode;
}

interface NotificationStackProps {
  items: StackItem[];
  style?: CSSProperties;
}

const peek = 7;
const inset = 6;
const gap = 6;

// Collapsed: only the first notification, the others peek out below it.
// A tap on the peeking edges spreads them into a list.
const NotificationStack = ({ items, style }: NotificationStackProps) => {
  const [expanded, setExpanded] = useState(false);
  const stacked = items.length > 1 && !expanded;

  useEffect(() => {
    if (items.length < 2) setExpanded(false);
  }, [items.length]);

  if (items.length === 0) return null;

  if (!stacked) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
        {items.map((item) => (
          <div
            key={item.key}
            // icon-only cards are narrower than the stack; keep them right-aligned
            style={{
              display: "flex",
              justifyContent: "flex-end",
              pointerEvents: "none",
            }}
          >
            {item.node}
          </div>
        ))}
        {items.length > 1 && (
          <button
            type="button"
            className="btn btn-light btn-sm"
            aria-label="Benachrichtigungen stapeln"
            style={{
              alignSelf: "flex-end",
              padding: "0 10px",
              pointerEvents: "auto",
            }}
            onClick={() => setExpanded(false)}
          >
            <FontAwesomeIcon icon={faChevronUp} />
          </button>
        )}
      </div>
    );
  }

  const [front, ...behind] = items;
  return (
    <div
      style={{
        position: "relative",
        paddingBottom: behind.length * peek,
        ...style,
      }}
    >
      <div style={{ position: "relative", zIndex: behind.length + 1 }}>
        {front.node}
      </div>
      <button
        type="button"
        aria-label={`${behind.length} weitere Benachrichtigung${
          behind.length > 1 ? "en" : ""
        } anzeigen`}
        onClick={() => setExpanded(true)}
        style={{
          position: "absolute",
          inset: 0,
          background: "none",
          border: 0,
          padding: 0,
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        {behind.map((item, i) => (
          <div
            key={item.key}
            className={`alert alert-${item.variant}`}
            style={{
              position: "absolute",
              left: inset * (i + 1),
              right: inset * (i + 1),
              bottom: (behind.length - 1 - i) * peek,
              height: 2 * peek,
              margin: 0,
              padding: 0,
              zIndex: behind.length - i,
            }}
          />
        ))}
      </button>
    </div>
  );
};

export default NotificationStack;
