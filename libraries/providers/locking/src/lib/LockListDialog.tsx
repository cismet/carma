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
  SortAscendingOutlined,
  SortDescendingOutlined,
  UnlockOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { DetailRows } from "./LockDetails";
import { lockRows, lockSentence, lockWhere } from "./lockText";
import type { HeldLock } from "./types";

export interface LockListItem {
  key: string;
  objectLabel: string;
  lock: HeldLock;
  lockedVia?: string | undefined;
  parentKey?: string | undefined;
}

export interface LockListNesting {
  show?: boolean;
  expanded?: boolean;
  unlockTogether?: boolean;
}

export interface LockListDialogProps {
  open: boolean;
  items: LockListItem[] | undefined;
  loading: boolean;
  error?: string | undefined;
  nested?: LockListNesting;
  onUnlock: (item: LockListItem, nested: LockListItem[]) => Promise<void>;
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

const childrenByParent = (items: LockListItem[]) => {
  const keys = new Set(items.map(({ key }) => key));
  const children = new Map<string, LockListItem[]>();
  for (const item of items) {
    if (item.parentKey && keys.has(item.parentKey)) {
      children.set(item.parentKey, [
        ...(children.get(item.parentKey) ?? []),
        item,
      ]);
    }
  }
  return children;
};

const countText = (shown: number, total: number) =>
  shown === total
    ? `(${String(total)})`
    : `(${String(shown)} von ${String(total)})`;

const UserName = ({ lock }: { lock: HeldLock }) => {
  const [name, group] = lock.userString.split("@");
  return (
    <Flex align="center" gap={8} wrap>
      <Typography.Text strong>{name}</Typography.Text>
      {group && (
        <Tag bordered={false} style={{ margin: 0 }}>
          {group}
        </Tag>
      )}
    </Flex>
  );
};

const useBusy = (action: () => Promise<void>) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
};

const UnlockButton = ({
  title,
  busy,
  onClick,
}: {
  title: string;
  busy: boolean;
  onClick: () => void;
}) => (
  <Tooltip title={title}>
    <Button
      type="text"
      danger
      icon={<UnlockOutlined />}
      loading={busy}
      onClick={onClick}
      aria-label={title}
    />
  </Tooltip>
);

const NestedRow = ({
  item,
  parentUser,
  onUnlock,
}: {
  item: LockListItem;
  parentUser: string;
  onUnlock: (item: LockListItem, nested: LockListItem[]) => Promise<void>;
}) => {
  const [busy, unlock] = useBusy(() => onUnlock(item, []));
  return (
    <Flex justify="space-between" align="center" gap={16}>
      <Flex vertical style={{ minWidth: 0 }}>
        <Typography.Text ellipsis>{item.objectLabel}</Typography.Text>
        <Typography.Text type="secondary" ellipsis>
          {item.lock.userString !== parentUser
            ? lockSentence(item.lock)
            : `Gesperrt ${lockWhere(item.lock)}`}
        </Typography.Text>
      </Flex>
      <UnlockButton
        title="Entsperren"
        busy={busy}
        onClick={() => void unlock()}
      />
    </Flex>
  );
};

const LockCard = ({
  item,
  nested,
  shownNested,
  expanded: initiallyExpanded,
  onUnlock,
}: {
  item: LockListItem;
  nested: LockListItem[];
  shownNested: LockListItem[];
  expanded: boolean;
  onUnlock: (item: LockListItem, nested: LockListItem[]) => Promise<void>;
}) => {
  const { token } = theme.useToken();
  const [busy, unlock] = useBusy(() => onUnlock(item, nested));
  const [expanded, setExpanded] = useState(initiallyExpanded);
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
        </Flex>
        <UnlockButton
          title={
            nested.length
              ? `Entsperren (mit ${String(
                  nested.length
                )} verschachtelten Objekten)`
              : "Entsperren"
          }
          busy={busy}
          onClick={() => void unlock()}
        />
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
            ...lockRows(item.lock, false),
            ...(item.lockedVia
              ? [{ key: "via", label: "Gesperrt über", value: item.lockedVia }]
              : []),
          ]}
        />
      </div>
      {shownNested.length > 0 && (
        <Flex
          vertical
          gap={8}
          style={{
            padding: "8px 8px 8px 16px",
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Link
            type="secondary"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <DownOutlined style={{ fontSize: 10 }} />
            ) : (
              <RightOutlined style={{ fontSize: 10 }} />
            )}{" "}
            Verschachtelte Objekte ({shownNested.length})
          </Typography.Link>
          {expanded &&
            shownNested.map((child) => (
              <NestedRow
                key={child.key}
                item={child}
                parentUser={item.lock.userString}
                onUnlock={onUnlock}
              />
            ))}
        </Flex>
      )}
    </Flex>
  );
};

export const LockListDialog = ({
  open,
  items,
  loading,
  error,
  nested,
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
  const showNested = nested?.show ?? false;
  const children = useMemo(() => childrenByParent(items ?? []), [items]);
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    const passes = (item: LockListItem) =>
      (activeUser === ALL_USERS || item.lock.userString === activeUser) &&
      (!text || matches(item, text));
    const isNested = (item: LockListItem) =>
      item.parentKey !== undefined && children.has(item.parentKey);
    return (items ?? [])
      .filter((item) =>
        showNested
          ? !isNested(item) &&
            [item, ...(children.get(item.key) ?? [])].some(passes)
          : passes(item)
      )
      .sort((a, b) =>
        newestFirst ? b.lock.id - a.lock.id : a.lock.id - b.lock.id
      );
  }, [items, children, showNested, query, activeUser, newestFirst]);
  const nestedOf = (item: LockListItem) => children.get(item.key) ?? [];
  const shownCount = showNested
    ? shown.reduce((sum, item) => sum + 1 + nestedOf(item).length, 0)
    : shown.length;

  return (
    <Modal
      open={open}
      title={
        <span>
          Gesperrte Objekte
          {items && (
            <Typography.Text
              type="secondary"
              style={{ fontWeight: "normal", marginLeft: 6 }}
            >
              {countText(shownCount, items.length)}
            </Typography.Text>
          )}
        </span>
      }
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
        <Flex align="center" gap={8} style={{ marginBottom: 3 }}>
          <Input.Search
            allowClear
            placeholder="Objekt suchen"
            style={{ flex: 1, minWidth: 0 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            style={{ width: 220, flex: "none" }}
            value={activeUser}
            options={users}
            // long names like "cismet@Bearbeiter@BELIS2" fit in the list
            popupMatchSelectWidth={false}
            onChange={setUser}
          />
          <Tooltip title={newestFirst ? "Neueste zuerst" : "Älteste zuerst"}>
            <Button
              style={{ flex: "none" }}
              icon={
                newestFirst ? (
                  <SortDescendingOutlined style={{ fontSize: 12 }} />
                ) : (
                  <SortAscendingOutlined style={{ fontSize: 12 }} />
                )
              }
              onClick={() => setNewestFirst((value) => !value)}
              aria-label={newestFirst ? "Neueste zuerst" : "Älteste zuerst"}
            />
          </Tooltip>
          <Button
            style={{ flex: "none" }}
            icon={<ReloadOutlined style={{ fontSize: 12 }} />}
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
                nested={nested?.unlockTogether ? nestedOf(item) : []}
                shownNested={showNested ? nestedOf(item) : []}
                expanded={nested?.expanded ?? false}
                onUnlock={onUnlock}
              />
            ))}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};
