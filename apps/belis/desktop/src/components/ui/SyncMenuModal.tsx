import { useState } from "react";
import { Modal, Badge, Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { TaskPanel, useSyncOptional } from "@carma-providers/syncing";

const SyncMenuModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const sync = useSyncOptional();

  const pendingCount = sync?.status.pendingCount ?? 0;
  const isConnected = sync?.status.isConnected ?? false;

  return (
    <>
      <Tooltip
        title={
          isConnected
            ? pendingCount > 0
              ? `Sync (${pendingCount} ausstehend)`
              : "Sync"
            : "Sync (nicht verbunden)"
        }
        placement="bottom"
      >
        <span
          className="inline-flex items-center cursor-pointer"
          onClick={() => setIsOpen(true)}
        >
          <Badge
            count={pendingCount}
            size="small"
            offset={[-2, 2]}
            style={{
              backgroundColor: pendingCount > 0 ? "#faad14" : "#52c41a",
            }}
          >
            <SyncOutlined
              className="text-base"
              style={{ color: isConnected ? "#52c41a" : "#faad14" }}
            />
          </Badge>
        </span>
      </Tooltip>

      <Modal
        title="Aktionen & Synchronisation"
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={null}
        width={800}
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        <TaskPanel
          emptyText="Keine Aktionen vorhanden"
          downloadLinkText="Mit diesem Link können Sie den lokalen Abzug der Tasks herunterladen."
          showAllButtonText="Alle Aktionen anzeigen"
          showRecentButtonText="Nur Fehler und letzte Aktionen"
          resyncButtonText="Sync neu starten"
          connectedText="Verbunden"
          disconnectedText="Nicht verbunden"
          pendingText={(count) => `${count} ausstehende Aktion(en)`}
        />
      </Modal>
    </>
  );
};

export default SyncMenuModal;
