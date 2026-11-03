import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Input,
  Modal,
  Select,
  Tooltip,
  Typography,
  theme,
} from "antd";
import { ReloadOutlined, UnlockOutlined } from "@ant-design/icons";
import { DetailRows } from "./LockDetails";
import { lockLine } from "./lockText";
import type { HeldLock } from "./types";

export interface LockListItem {
  key: string;
  objectLabel: string;
  lock: HeldLock;
  lockedVia?: string | undefined;
}

export interface LockListDialogProps {
  open: boolean;
  items: LockListItem[] | undefined;
  loading: boolean;
  error?: string | undefined;
  onUnlock: (item: LockListItem) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
}

type SortKey = "newest" | "oldest" | "user" | "object";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "user", label: "Nach Benutzer" },
  { value: "object", label: "Nach Objekt" },
];

const byText = (a: string, b: string) => a.localeCompare(b, "de");

const compare: Record<SortKey, (a: LockListItem, b: LockListItem) => number> = {
  newest: (a, b) => b.lock.id - a.lock.id,
  oldest: (a, b) => a.lock.id - b.lock.id,
  user: (a, b) =>
    byText(a.lock.userString, b.lock.userString) || b.lock.id - a.lock.id,
  object: (a, b) => byText(a.objectLabel, b.objectLabel),
};

const matches = (item: LockListItem, query: string) =>
  [item.objectLabel, item.lock.userString, item.lockedVia ?? ""].some((text) =>
    text.toLowerCase().includes(query)
  );

const countText = (shown: number, total: number) => {
  const objects = (n: number) => (n === 1 ? "Objekt" : "Objekte");
  return shown === total
    ? `${String(total)} ${objects(total)} gesperrt`
    : `${String(shown)} von ${String(total)} ${objects(total)}`;
};

const UserName = ({ lock }: { lock: HeldLock }) => {
  const [name, group] = lock.userString.split("@");
  return (
    <span>
      <Typography.Text strong>{name}</Typography.Text>
      {group && <Typography.Text type="secondary"> · {group}</Typography.Text>}
    </span>
  );
};

const LockCard = ({
  item,
  onUnlock,
}: {
  item: LockListItem;
  onUnlock: (item: LockListItem) => Promise<void>;
}) => {
  const { token } = theme.useToken();
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    try {
      await onUnlock(item);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Flex
      vertical
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowTertiary,
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
          {item.objectLabel}
        </Typography.Text>
        <Tooltip title="Entsperren">
          <Button
            danger
            size="small"
            icon={<UnlockOutlined />}
            loading={busy}
            onClick={() => void unlock()}
            aria-label="Entsperren"
          />
        </Tooltip>
      </Flex>
      <div style={{ padding: "12px 16px" }}>
        <DetailRows
          labelWidth={110}
          rows={[
            {
              key: "user",
              label: "Benutzer",
              value: <UserName lock={item.lock} />,
            },
            { key: "lock", label: "Gesperrt", value: lockLine(item.lock) },
            ...(item.lockedVia
              ? [{ key: "via", label: "Gesperrt über", value: item.lockedVia }]
              : []),
          ]}
        />
      </div>
    </Flex>
  );
};

export const LockListDialog = ({
  open,
  items,
  loading,
  error,
  onUnlock,
  onReload,
  onClose,
}: LockListDialogProps) => {
  const { token } = theme.useToken();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => !text || matches(item, text))
      .sort(compare[sort]);
  }, [items, query, sort]);

  return (
    <Modal
      open={open}
      title="Gesperrte Objekte"
      width={640}
      centered
      maskClosable
      footer={null}
      onCancel={onClose}
    >
      <Flex
        vertical
        gap={12}
        style={{ maxHeight: "min(600px, calc(100vh - 240px))" }}
      >
        <Flex align="center" gap={8} wrap="wrap" style={{ marginBottom: 8 }}>
          <Typography.Text strong style={{ marginRight: "auto" }}>
            {items ? countText(shown.length, items.length) : " "}
          </Typography.Text>
          <Input.Search
            allowClear
            placeholder="Objekt oder Benutzer"
            style={{ width: 220 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            style={{ width: 160 }}
            value={sort}
            options={SORTS}
            onChange={setSort}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={onReload}
            aria-label="Neu laden"
          />
        </Flex>
        {error && <Alert type="error" showIcon message={error} />}
        {items && shown.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={items.length ? "Keine Treffer" : "Keine Sperren"}
          />
        ) : (
          <Flex
            vertical
            gap={12}
            style={{
              minHeight: 0,
              overflowY: "auto",
              padding: 12,
              borderRadius: token.borderRadiusLG,
              background: token.colorBgLayout,
            }}
          >
            {shown.map((item) => (
              <LockCard key={item.key} item={item} onUnlock={onUnlock} />
            ))}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};
