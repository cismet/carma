import { useState, type ReactNode } from "react";
import { Flex, Typography, theme } from "antd";
import { clientLabel, sinceOf } from "./lockText";
import type { HeldLock, Lock } from "./types";

export interface DetailRow {
  key: string;
  label: string;
  value: ReactNode;
}

// "Chrome · seit 2.11.2026, 13:49"
const lockLine = (lock: Lock) =>
  [clientLabel(lock), sinceOf(lock) && `seit ${sinceOf(lock) ?? ""}`]
    .filter(Boolean)
    .join(" · ");

const HISTORY_ROWS = 10;

const Row = ({ label, children }: { label: string; children: ReactNode }) => {
  const { token } = theme.useToken();
  return (
    <Flex gap={16}>
      <span
        style={{ width: 128, flexShrink: 0, color: token.colorTextSecondary }}
      >
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </Flex>
  );
};

const History = ({ locks }: { locks: Lock[] }) => {
  const [open, setOpen] = useState(false);
  const newest = [...locks].reverse();
  const older = newest.length - HISTORY_ROWS;
  return (
    <Row label="Frühere Sperren">
      <Typography.Link
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? "ausblenden" : `${String(locks.length)} anzeigen`}
      </Typography.Link>
      {open && (
        <div style={{ marginTop: 4 }}>
          {newest.slice(0, HISTORY_ROWS).map((old) => (
            <div key={old.id}>{lockLine(old)}</div>
          ))}
          {older > 0 && (
            <Typography.Text type="secondary">
              und {String(older)} ältere
            </Typography.Text>
          )}
        </div>
      )}
    </Row>
  );
};

export const LockDetails = ({
  lock,
  showUser = false,
  extra = [],
}: {
  lock?: HeldLock | undefined;
  showUser?: boolean;
  extra?: DetailRow[];
}) => {
  const { token } = theme.useToken();
  return (
    <Flex
      vertical
      gap={8}
      style={{
        padding: "12px 16px",
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}
    >
      {extra.map((row) => (
        <Row key={row.key} label={row.label}>
          {row.value}
        </Row>
      ))}
      {lock && (
        <Row label={showUser ? "Gesperrt von" : "Aktuelle Sperre"}>
          {showUser && (
            <Typography.Text strong>{lock.userString} · </Typography.Text>
          )}
          {lockLine(lock)}
        </Row>
      )}
      {lock && lock.history.length > 0 && <History locks={lock.history} />}
    </Flex>
  );
};
