import { Fragment, type ReactNode } from "react";
import { Flex, Typography, theme } from "antd";
import { lockRows } from "./lockText";
import type { HeldLock } from "./types";

export interface DetailRow {
  key: string;
  label: string;
  value: ReactNode;
}

export const DetailRows = ({
  rows,
  labelWidth,
}: {
  rows: DetailRow[];
  labelWidth?: number;
}) => {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${
          labelWidth ? `${String(labelWidth)}px` : "max-content"
        } minmax(0, 1fr)`,
        columnGap: 24,
        rowGap: 8,
      }}
    >
      {rows.map((row) => (
        <Fragment key={row.key}>
          <span style={{ color: token.colorTextSecondary }}>{row.label}</span>
          <div>{row.value}</div>
        </Fragment>
      ))}
    </div>
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
  objectLabel,
  lock,
  showUser = false,
  extra = [],
}: {
  objectLabel?: string | undefined;
  lock?: HeldLock | undefined;
  showUser?: boolean;
  extra?: DetailRow[];
}) => (
  <DetailsBox>
    <DetailRows
      rows={[
        ...(objectLabel
          ? [
              {
                key: "object",
                label: "Objekt",
                value: <Typography.Text strong>{objectLabel}</Typography.Text>,
              },
            ]
          : []),
        ...extra,
        ...(lock ? lockRows(lock, showUser) : []),
      ]}
    />
  </DetailsBox>
);
