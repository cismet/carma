import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Flex,
  Input,
  Modal,
  Select,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { DetailRows } from "./LockDetails";
import { isStaleLock, lockLine } from "./lockText";
import type { HeldLock } from "./types";

export interface LockListItem {
  key: string;
  objectLabel: string;
  lock: HeldLock;
  lockedVia?: string | undefined;
}

export interface LockListDialogProps {
  open: boolean;
  staleAfterHours?: number;
  items: LockListItem[] | undefined;
  loading: boolean;
  error?: string | undefined;
  onUnlock: (item: LockListItem) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
}

const ALL_USERS = "";

const userOptions = (items: LockListItem[]) => {
  const counts = new Map<string, number>();
  for (const { lock } of items) {
    counts.set(lock.userString, (counts.get(lock.userString) ?? 0) + 1);
  }
  return [
    { value: ALL_USERS, label: "Alle Benutzer" },
    ...[...counts]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([user, count]) => ({
        value: user,
        label: `${user} (${String(count)})`,
      })),
  ];
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
  staleAfterHours,
  onUnlock,
}: {
  item: LockListItem;
  staleAfterHours: number;
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
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        overflow: "hidden",
        flex: "none",
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        gap={16}
        style={{
          padding: "8px 8px 8px 16px",
          background: token.colorFillAlter,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <Typography.Text
            strong
            ellipsis
            style={{ fontSize: token.fontSizeLG }}
          >
            {item.objectLabel}
          </Typography.Text>
          {isStaleLock(item.lock, staleAfterHours) && (
            <Tag
              color="warning"
              bordered={false}
              style={{ marginInlineEnd: 0 }}
            >
              älter als {staleAfterHours} Std.
            </Tag>
          )}
        </Flex>
        <Tooltip title="Entsperren">
          <Button
            type="text"
            danger
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
  staleAfterHours = 8,
  items,
  loading,
  error,
  onUnlock,
  onReload,
  onClose,
}: LockListDialogProps) => {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState(ALL_USERS);
  const [newestFirst, setNewestFirst] = useState(true);
  const users = useMemo(() => userOptions(items ?? []), [items]);
  const activeUser = users.some(({ value }) => value === user)
    ? user
    : ALL_USERS;
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (items ?? [])
      .filter(
        (item) =>
          (activeUser === ALL_USERS || item.lock.userString === activeUser) &&
          (!text || matches(item, text))
      )
      .sort((a, b) =>
        newestFirst ? b.lock.id - a.lock.id : a.lock.id - b.lock.id
      );
  }, [items, query, activeUser, newestFirst]);

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
        <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
          <Typography.Text
            strong
            style={{ marginRight: "auto", whiteSpace: "nowrap" }}
          >
            {items ? countText(shown.length, items.length) : " "}
          </Typography.Text>
          <Input.Search
            allowClear
            placeholder="Objekt suchen"
            style={{ flex: "1 1 auto", minWidth: 120, maxWidth: 220 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            style={{ width: 160, flex: "none" }}
            value={activeUser}
            options={users}
            onChange={setUser}
          />
          <Tooltip title={newestFirst ? "Neueste zuerst" : "Älteste zuerst"}>
            <Button
              style={{ flex: "none" }}
              icon={newestFirst ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
              onClick={() => setNewestFirst((value) => !value)}
              aria-label={newestFirst ? "Neueste zuerst" : "Älteste zuerst"}
            />
          </Tooltip>
          <Button
            style={{ flex: "none" }}
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
              paddingRight: 4,
            }}
          >
            {shown.map((item) => (
              <LockCard
                key={item.key}
                item={item}
                staleAfterHours={staleAfterHours}
                onUnlock={onUnlock}
              />
            ))}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};
