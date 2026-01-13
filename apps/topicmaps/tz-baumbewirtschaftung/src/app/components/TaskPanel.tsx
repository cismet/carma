import { Button, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
  CloudOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { useSyncOptional, TaskItem } from "../../core/sync";

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

// Get action emoji based on the action's status (open, done, exception)
const getActionEmoji = (actionStatus: TaskItem["actionStatus"]) => {
  switch (actionStatus) {
    case "open":
      return <span style={{ fontSize: 20 }} title="Gestartet">▶️</span>;
    case "done":
      return <span style={{ fontSize: 20 }} title="Abgeschlossen">✅</span>;
    case "exception":
      return <span style={{ fontSize: 20 }} title="Ausnahme">⚠️</span>;
    default:
      return <span style={{ fontSize: 20 }} title="Unbekannt">❓</span>;
  }
};

const TaskPanel = () => {
  const sync = useSyncOptional();
  const [showAll, setShowAll] = useState(false);
  const [shownTasks, setShownTasks] = useState<TaskItem[]>([]);

  const tasks = sync?.tasks || [];

  useEffect(() => {
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
    setShownTasks(results);
  }, [showAll, tasks]);

  const columns = [
    {
      title: "Aktion",
      dataIndex: "actionStatus",
      key: "action",
      align: "center" as const,
      width: 80,
      render: (_: unknown, record: TaskItem) => getActionEmoji(record.actionStatus),
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
          Sync Mechanismus neu starten
        </Button>
        <Button
          style={{ float: "right" }}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Nur Fehler und letzte Aktionen" : "Alle Aktionen anzeigen"}
        </Button>
        <div style={{ clear: "both" }} />
      </div>

      <Table
        locale={{ emptyText: "Keine Aktionen vorhanden" }}
        rowKey="id"
        key={`table.${showAll}`}
        dataSource={shownTasks}
        columns={columns}
        size="small"
        pagination={{ pageSize: 10 }}
      />

      <p style={{ marginTop: 16 }}>
        Mit diesem{" "}
        <a
          style={{ cursor: "pointer", color: "#1890ff" }}
          onClick={() => sync.downloadTasks()}
        >
          Link
        </a>{" "}
        können Sie den lokalen Abzug der Tasks herunterladen.
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
        {sync.status.isConnected ? "Verbunden" : "Nicht verbunden"}
        {sync.status.pendingCount > 0 &&
          ` | ${sync.status.pendingCount} ausstehende Aktion(en)`}
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
