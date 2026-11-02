import { Alert, Button, Flex, Modal } from "antd";
import { LockDetails } from "./LockDetails";
import { isJavaLock, takeOverWarning } from "./lockText";
import type { HeldLock } from "./types";

export interface TakeOverDialogProps {
  lock: HeldLock | undefined;
  objectLabel: string;
  onTakeOver: () => void;
  onCancel: () => void;
  busy?: boolean;
  staleAfterHours?: number;
}

export const TakeOverDialog = ({
  lock,
  objectLabel,
  onTakeOver,
  onCancel,
  busy = false,
  staleAfterHours = 8,
}: TakeOverDialogProps) => {
  const warning = lock && takeOverWarning(lock, staleAfterHours);
  return (
    <Modal
      open={Boolean(lock)}
      title={`${objectLabel} ist von Ihnen gesperrt`}
      width={520}
      maskClosable={false}
      onCancel={onCancel}
      footer={
        <Flex justify="end" gap={8}>
          <Button disabled={busy} onClick={onCancel}>
            Abbrechen
          </Button>
          <Button
            type="primary"
            danger={lock && isJavaLock(lock)}
            loading={busy}
            onClick={onTakeOver}
          >
            Bearbeitung übernehmen
          </Button>
        </Flex>
      }
    >
      {lock && warning && (
        <Flex vertical gap={16}>
          <LockDetails lock={lock} />
          <Alert
            type={warning.type}
            showIcon
            message={warning.message}
            description={warning.description}
          />
        </Flex>
      )}
    </Modal>
  );
};
