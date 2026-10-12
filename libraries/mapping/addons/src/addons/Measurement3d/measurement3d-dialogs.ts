import { Modal } from "antd";
import type {
  AnnotationDeleteConfirmationRequester,
  SharedAnnotationsConflict,
  SharedAnnotationsConflictDecision,
} from "@carma-mapping/annotations/runtime";
import { MEASUREMENT3D_TEXT } from "./measurement3d-layer-row";

/** The host's dialog before measurements go: the Cesium view asks the same. */
export const confirmMeasurementDelete: AnnotationDeleteConfirmationRequester =
  ({ annotations }) =>
    annotations.length === 0
      ? false
      : new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: MEASUREMENT3D_TEXT.deleteConfirm.title,
            content:
              annotations.length === 1
                ? MEASUREMENT3D_TEXT.deleteConfirm.one
                : MEASUREMENT3D_TEXT.deleteConfirm.many(annotations.length),
            okText: MEASUREMENT3D_TEXT.deleteConfirm.ok,
            okButtonProps: { danger: true },
            cancelText: MEASUREMENT3D_TEXT.deleteConfirm.cancel,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });

const SHARED_MEASUREMENTS_TEXT = Object.freeze({
  title: "Geteilte Messungen weichen ab",
  body: (count: number) =>
    `${count} geteilte ${
      count === 1 ? "Messung unterscheidet" : "Messungen unterscheiden"
    } sich von ${count === 1 ? "der lokalen" : "den lokalen"}.`,
  update: "Lokale aktualisieren",
  discard: "Neue verwerfen",
});

/** The host's answer for shared measurements that changed locally held ones. */
export const confirmSharedMeasurementsConflicts = (
  conflicts: readonly SharedAnnotationsConflict[]
): Promise<SharedAnnotationsConflictDecision> =>
  new Promise((resolve) => {
    Modal.confirm({
      title: SHARED_MEASUREMENTS_TEXT.title,
      content: SHARED_MEASUREMENTS_TEXT.body(conflicts.length),
      okText: SHARED_MEASUREMENTS_TEXT.update,
      cancelText: SHARED_MEASUREMENTS_TEXT.discard,
      onOk: () => resolve("update"),
      onCancel: () => resolve("discard"),
    });
  });
