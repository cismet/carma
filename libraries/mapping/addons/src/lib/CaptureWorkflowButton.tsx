import { useState, useSyncExternalStore } from "react";
import { useStore } from "react-redux";
import { Input, Modal } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";

import { carma } from "@carma-api";
import type { LayerStackEntry } from "@carma-mapping/layers";

import { useAddonStateSnapshot } from "./AddonStateContext";
import type { AddonKind } from "./registry";
import { getWorkflowSpec, workflowGroupId } from "./workflow-groups";

type LayerStackState = { mapping?: { layers?: LayerStackEntry[] } };

/**
 * "Als Layer speichern": turns the running workflow of `kind` into a
 * workflow group. Asks for a title, prefilled with what the spec suggests,
 * then hands the group to the host through the carma api, which moves the
 * members out of the top level and appends the group. Disabled while the
 * spec has nothing to capture.
 */
export const CaptureWorkflowButton = ({
  kind,
  className,
}: {
  kind: AddonKind;
  className?: string;
}) => {
  const store = useStore();
  const snapshot = useAddonStateSnapshot();
  const stack = useSyncExternalStore(
    store.subscribe,
    () => (store.getState() as LayerStackState).mapping?.layers
  );
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const spec = getWorkflowSpec(kind);
  if (!spec) {
    return null;
  }
  const capture = spec.capture({ snapshot, stack: stack ?? [] });

  const confirm = () => {
    if (!capture) {
      return;
    }
    carma.mapping2D.createWorkflowGroup({
      id: workflowGroupId(kind),
      title: title.trim() || capture.suggestedTitle,
      ...(capture.description ? { description: capture.description } : {}),
      icon: spec.icon,
      memberIds: capture.memberIds,
      tool: { addon: kind, config: capture.definition },
    });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={!capture}
        onClick={() => {
          if (!capture) {
            return;
          }
          setTitle(capture.suggestedTitle);
          setOpen(true);
        }}
        title={
          capture
            ? `${spec.label} als eigenen Karteninhalt ablegen`
            : "Nichts zu speichern"
        }
        data-test-id={`capture-workflow-${kind}`}
        className={
          className ??
          "shrink-0 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:text-gray-300 bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed"
        }
      >
        <FontAwesomeIcon icon={faFloppyDisk} />
        Als Layer speichern
      </button>
      <Modal
        title={`${spec.label} als Layer speichern`}
        open={open}
        onOk={confirm}
        onCancel={() => setOpen(false)}
        okText="Speichern"
        cancelText="Abbrechen"
        destroyOnClose
      >
        <Input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onPressEnter={confirm}
          placeholder="Titel"
          data-test-id={`capture-workflow-${kind}-title`}
        />
      </Modal>
    </>
  );
};
