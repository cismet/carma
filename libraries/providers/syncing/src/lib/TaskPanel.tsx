import { Button, Table, Typography } from "antd";
import { useState, useMemo } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
  CloudOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { useSyncOptional } from "./SyncProvider";
import type { TaskItem } from "./types";

const { Text } = Typography;

// Get sync status icon (server/sync status)
const getStatusIcon = (statusCode?: number, isCompleted?: boolean) => {
  if (isCompleted && statusCode === 200) {
    return (
      <CheckCircleOutlined
        style={{ color: "#52c41a", fontSize: 18 }}
        title="Erfolgreich ausgeführt"
      />
    );
  }
  if (statusCode === 500) {
    return (
      <ExclamationCircleOutlined
        style={{ color: "#ff4d4f", fontSize: 18 }}
        title="Fehler bei der Ausführung"
      />
    );
  }
  if (statusCode === 401) {
    return (
      <ExclamationCircleOutlined
        style={{ color: "#faad14", fontSize: 18 }}
        title="Token abgelaufen"
      />
    );
  }
  if (statusCode === 202) {
    return (
      <SyncOutlined
        spin
        style={{ color: "#1890ff", fontSize: 18 }}
        title="Wird ausgeführt"
      />
    );
  }
  if (statusCode === null) {
    return (
      <CloudOutlined
        style={{ color: "#faad14", fontSize: 18 }}
        title="Auf Server hinterlegt"
      />
    );
  }
  if (statusCode === undefined && !isCompleted) {
    return (
      <DesktopOutlined
        style={{ color: "#faad14", fontSize: 18 }}
        title="Lokal gespeichert"
      />
    );
  }
  return (
    <QuestionCircleOutlined
      style={{ color: "#8c8c8c", fontSize: 18 }}
      title={`Status: ${statusCode}`}
    />
  );
};

// Get action emoji based on the action type or status
const getActionEmoji = (actionStatus: TaskItem["actionStatus"]) => {
  switch (actionStatus) {
    // Action types
    case "createObject":
      return (
        <span style={{ fontSize: 20 }} title="Neues Objekt erstellen">
          ➕
        </span>
      );
    case "editObject":
      return (
        <span style={{ fontSize: 20 }} title="Objekt bearbeiten">
          ✏️
        </span>
      );
    case "deleteObject":
      return (
        <span style={{ fontSize: 20 }} title="Objekt löschen">
          🗑️
        </span>
      );
    // Legacy status values
    case "open":
      return (
        <span style={{ fontSize: 20 }} title="Gestartet">
          ▶️
        </span>
      );
    case "done":
      return (
        <span style={{ fontSize: 20 }} title="Abgeschlossen">
          ✅
        </span>
      );
    case "exception":
      return (
        <span style={{ fontSize: 20 }} title="Ausnahme">
          ⚠️
        </span>
      );
    default:
      return (
        <span style={{ fontSize: 20 }} title="Unbekannt">
          ❓
        </span>
      );
  }
};

interface TaskPanelProps {
  emptyText?: string;
  downloadLinkText?: string;
  showAllButtonText?: string;
  showRecentButtonText?: string;
  resyncButtonText?: string;
  connectedText?: string;
  disconnectedText?: string;
  pendingText?: (count: number) => string;
}

const TaskPanel = ({
  emptyText = "Keine Aktionen vorhanden",
  downloadLinkText = "Mit diesem Link können Sie den lokalen Abzug der Tasks herunterladen.",
  showAllButtonText = "Alle Aktionen anzeigen",
  showRecentButtonText = "Nur Fehler und letzte Aktionen",
  resyncButtonText = "Sync Mechanismus neu starten",
  connectedText = "Verbunden",
  disconnectedText = "Nicht verbunden",
  pendingText = (count) => `${count} ausstehende Aktion(en)`,
}: TaskPanelProps) => {
  const sync = useSyncOptional();
  const [showAll, setShowAll] = useState(false);

  const tasks = useMemo(() => sync?.tasks || [], [sync?.tasks]);

  const shownTasks = useMemo(() => {
    let results: TaskItem[];

    if (showAll) {
      results = [...tasks].sort((a, b) => {
        return new Date(b.datum).getTime() - new Date(a.datum).getTime();
      });
    } else {
      const now = new Date().getTime();
      const threeDays = 1000 * 60 * 60 * 24 * 3;

      results = tasks.filter((task) => {
        return (
          task.statusCode !== 200 ||
          now - new Date(task.datum).getTime() < threeDays
        );
      });
      results = results.sort((a, b) => {
        return new Date(b.datum).getTime() - new Date(a.datum).getTime();
      });
    }
    return results;
  }, [showAll, tasks]);

  const columns = [
    {
      title: "Aktion",
      dataIndex: "actionStatus",
      key: "action",
      align: "center" as const,
      width: 80,
      render: (_: unknown, record: TaskItem) =>
        getActionEmoji(record.actionStatus),
    },
    {
      title: "Datum",
      dataIndex: "datum",
      key: "datum",
      width: 160,
      render: (date: string) => (
        <Text>{new Date(date).toLocaleString("de-DE")}</Text>
      ),
    },
    {
      title: "Fachobjekt",
      dataIndex: "fachobjekt",
      key: "fachobjekt",
    },
    {
      title: "Beschreibung",
      dataIndex: "beschreibung",
      key: "beschreibung",
    },
    {
      title: "Status",
      dataIndex: "statusCode",
      key: "status",
      align: "center" as const,
      width: 80,
      render: (_: unknown, record: TaskItem) =>
        getStatusIcon(record.statusCode, record.isCompleted),
    },
  ];

  if (!sync) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#999" }}>
        Sync nicht verfügbar
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button
          style={{ float: "right", marginLeft: 10 }}
          onClick={() => sync.resync()}
          icon={<SyncOutlined />}
        >
          {resyncButtonText}
        </Button>
        <Button style={{ float: "right" }} onClick={() => setShowAll(!showAll)}>
          {showAll ? showRecentButtonText : showAllButtonText}
        </Button>
        <div style={{ clear: "both" }} />
      </div>

      <Table
        locale={{ emptyText }}
        rowKey="id"
        key={`table.${showAll}`}
        dataSource={shownTasks}
        columns={columns}
        size="small"
        pagination={{ pageSize: 10 }}
      />

      <p style={{ marginTop: 16 }}>
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#1890ff",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={() => sync.downloadTasks()}
        >
          Link
        </button>{" "}
        - {downloadLinkText}
      </p>

      {/* Sync status indicator */}
      <div
        style={{
          marginTop: 8,
          padding: 8,
          background: sync.status.isConnected ? "#f6ffed" : "#fffbe6",
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        {sync.status.isConnected ? (
          <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 8 }} />
        ) : (
          <ClockCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />
        )}
        {sync.status.isConnected ? connectedText : disconnectedText}
        {sync.status.pendingCount > 0 &&
          ` | ${pendingText(sync.status.pendingCount)}`}
        {sync.status.lastError && (
          <span style={{ color: "#ff4d4f", marginLeft: 8 }}>
            | Fehler: {sync.status.lastError}
          </span>
        )}
      </div>
    </div>
  );
};

export default TaskPanel;
