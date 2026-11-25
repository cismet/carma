import type { CSSProperties, ReactNode } from "react";

export interface StackItem {
  key: string;
  node: ReactNode;
}

interface NotificationStackProps {
  items: StackItem[];
  style?: CSSProperties;
}

const gap = 8;

const NotificationStack = ({ items, style }: NotificationStackProps) => {
  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            justifyContent: "flex-end",
            pointerEvents: "none",
          }}
        >
          {item.node}
        </div>
      ))}
    </div>
  );
};

export default NotificationStack;
