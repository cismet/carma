import type { ReactNode } from "react";
import { Flex, Typography, theme } from "antd";
import { lockLine } from "./lockText";
import type { HeldLock } from "./types";

export interface DetailRow {
  key: string;
  label: string;
  value: ReactNode;
}

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

export const DetailsBox = ({ children }: { children: ReactNode }) => {
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
      {children}
    </Flex>
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
}) => (
  <DetailsBox>
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
  </DetailsBox>
);
