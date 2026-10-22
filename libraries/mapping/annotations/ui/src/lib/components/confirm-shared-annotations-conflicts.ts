import { Modal } from "antd";

export type SharedAnnotationsConflictDecision = "update" | "discard";

const SHARED_ANNOTATIONS_CONFLICT_TEXT = Object.freeze({
  title: "Geteilte Messungen weichen ab",
  body: (count: number) =>
    `${count} geteilte ${
      count === 1 ? "Messung unterscheidet" : "Messungen unterscheiden"
    } sich von ${count === 1 ? "der lokalen" : "den lokalen"}.`,
  update: "Lokale aktualisieren",
  discard: "Neue verwerfen",
});

/** The dialog for shared measurements that differ from the local ones; the `confirmConflicts` of the runtime's `SharedAnnotationsImport`. */
export const confirmSharedAnnotationsConflicts = (
  conflicts: readonly unknown[]
): Promise<SharedAnnotationsConflictDecision> =>
  new Promise((resolve) => {
    Modal.confirm({
      title: SHARED_ANNOTATIONS_CONFLICT_TEXT.title,
      content: SHARED_ANNOTATIONS_CONFLICT_TEXT.body(conflicts.length),
      okText: SHARED_ANNOTATIONS_CONFLICT_TEXT.update,
      cancelText: SHARED_ANNOTATIONS_CONFLICT_TEXT.discard,
      onOk: () => resolve("update"),
      onCancel: () => resolve("discard"),
    });
  });
