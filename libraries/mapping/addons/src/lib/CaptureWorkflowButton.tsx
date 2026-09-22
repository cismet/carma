import { useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "react-redux";
import { Input, Modal, message, type InputRef } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";

import { carma } from "@carma-api";
import type { LayerStackEntry } from "@carma-mapping/layers";

import { useAddonStateSnapshot } from "./AddonStateContext";
import type { AddonKind } from "./registry";
import { getWorkflowSpec, workflowGroupId } from "./workflow-groups";

type LayerStackState = { mapping?: { layers?: LayerStackEntry[] } };

/** a workflow id out of its title: "Vergleich: Luftbild 2020 / 2024" -> "vergleich-luftbild-2020-2024" */
const toWorkflowDefinitionId = (title: string): string =>
  title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
  const titleRef = useRef<InputRef>(null);

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

  /**
   * The same workflow as a Fachzwilling declares it: a `WorkflowDefinition`
   * for a route's `perspectives[].workflows`, with the members as `layers`
   * and the definition as the one tool. Pasted into a route config, every
   * visitor of that route gets the card.
   */
  const copyDefinition = () => {
    if (!capture) {
      return;
    }
    const effectiveTitle = title.trim() || capture.suggestedTitle;
    const definition = {
      id: toWorkflowDefinitionId(effectiveTitle),
      title: effectiveTitle,
      ...(capture.description ? { description: capture.description } : {}),
      layers: capture.memberIds,
      tools: [{ addon: kind, config: capture.definition }],
    };
    const text = JSON.stringify(definition, null, 2);
    const write = navigator.clipboard?.writeText(text);
    if (!write) {
      message.error("Die Zwischenablage ist hier nicht erreichbar.");
      return;
    }
    void write.then(
      () => message.success("Workflow-Definition kopiert."),
      (error: unknown) => {
        console.warn("[WORKFLOW] the definition could not be copied", error);
        message.error("Die Zwischenablage ist hier nicht erreichbar.");
      }
    );
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
        // `autoFocus` on the field fires while the modal is still animating
        // in and gets lost; focus once it is open, caret at the end of the
        // suggested title, as if the field had been clicked
        afterOpenChange={(opened) => {
          if (opened) {
            titleRef.current?.focus({ cursor: "end" });
          }
        }}
      >
        <Input.TextArea
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          // Enter confirms, it does not add a line to the title
          onPressEnter={(event) => {
            event.preventDefault();
            confirm();
          }}
          // a suggested title names every compared layer, so it can be long;
          // the field grows with it instead of cutting it off
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder="Titel"
          data-test-id={`capture-workflow-${kind}-title`}
        />
        <button
          type="button"
          onClick={copyDefinition}
          title="Als Workflow-Definition für eine Fachzwilling-Konfiguration kopieren"
          data-test-id={`capture-workflow-${kind}-copy-definition`}
          className="mt-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-transparent border-0 p-0 cursor-pointer"
        >
          <FontAwesomeIcon icon={faCopy} />
          Workflow-Definition kopieren
        </button>
      </Modal>
    </>
  );
};
