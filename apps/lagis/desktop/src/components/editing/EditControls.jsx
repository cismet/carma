import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Modal, Tooltip, message } from "antd";
import { EditOutlined, CheckOutlined } from "@ant-design/icons";
import {
  getAlkisLandparcel,
  getLandparcel,
  fetchFlurstueck,
} from "../../store/slices/lagis";
import {
  LockLostDialog,
  ResumeDraftDialog,
  TakeOverDialog,
  useEditDraft,
  useHolderCheck,
  useResumableDraft,
} from "@carma-providers/locking";
import {
  editEnded,
  editResumed,
  getEditActive,
  getEditDirty,
  getEditing,
  getEditParcel,
  getEditStatus,
  getTakeOver,
  takeOverClosed,
  takeOverOffered,
} from "../../store/slices/editing";
import {
  discardEditing,
  errorMessage,
  saveEditing,
  startEditing,
} from "../../core/editing/session";
import { CLASS } from "../../core/wizard/api";
import {
  displayParcel,
  LockLostError,
  OwnLockError,
} from "../../core/editing/locks";
import UnsavedChangesDialog from "./UnsavedChangesDialog";
import { notifyStartFailed } from "./lockNotices";
import { DraftValidationError } from "../../core/editing/validation";

// the parcel lock first: it decides whether the draft can be resumed
const sessionLockIds = ({ lock, mipaLocks, rebeLocks }) => {
  const locks = [lock, ...(mipaLocks ?? []), ...(rebeLocks ?? [])];
  return [
    ...locks.map(({ id }) => id),
    ...locks.flatMap(({ replacedIds }) => replacedIds ?? []),
  ];
};

// everything but the status, so a resumed session starts idle
const toEditDraft = (editing) => {
  if (!editing.active) {
    return undefined;
  }
  const { status, takeOver, ...payload } = editing;
  return {
    target: { type: CLASS.SCHLUESSEL, id: editing.parcel.schluesselId },
    lockIds: sessionLockIds(editing),
    payload,
  };
};

export const urlParamsOf = (searchParams) => ({
  gem: searchParams.get("gem"),
  flur: searchParams.get("flur"),
  fstck: searchParams.get("fstck"),
});

// an own lock opens the take-over dialog instead of an error
const runStart = (dispatch, params) =>
  dispatch(startEditing(params))
    .then(() => true)
    .catch((error) => {
      if (error instanceof OwnLockError) {
        dispatch(
          takeOverOffered({
            lock: error.lock,
            keyString: error.keyString,
            schluesselId: params.schluesselId,
            urlParams: params.urlParams,
          })
        );
      } else {
        notifyStartFailed(error);
      }
      return false;
    });

export const useStartEditing = () => {
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const landparcel = useSelector(getLandparcel);
  const schluesselId = landparcel?.flurstueck_schluessel?.id;
  return () =>
    schluesselId
      ? runStart(dispatch, {
          schluesselId,
          urlParams: urlParamsOf(searchParams),
        })
      : Promise.resolve(false);
};

const ValidationProblems = ({ sections }) => (
  <div>
    <p className="mb-3 text-gray-600">
      Bitte vervollständigen Sie die rot markierten Angaben und speichern Sie
      erneut.
    </p>
    {sections.map(({ title, items }) => (
      <div key={title} className="mb-3 last:mb-0">
        <div className="font-semibold mb-1">{title}</div>
        <ul className="list-disc pl-5 m-0">
          {items.map(({ name, text }, index) => (
            <li key={index} className="mb-0.5">
              {name && <span className="font-medium">{name}</span>}
              {name && <span className="text-gray-400"> – </span>}
              {text}
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

// antd's default Modal width, as in UnsavedChangesDialog
const DIALOG_WIDTH = 520;

export const showSaveError = (error) =>
  error instanceof DraftValidationError
    ? Modal.warning({
        title: "Speichern nicht möglich",
        width: DIALOG_WIDTH,
        content: <ValidationProblems sections={error.sections} />,
      })
    : Modal.error({
        title: "Speichern fehlgeschlagen",
        width: DIALOG_WIDTH,
        content: (
          <span style={{ whiteSpace: "pre-line" }}>{errorMessage(error)}</span>
        ),
      });

const EditControls = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const landparcel = useSelector(getLandparcel);
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const isEdit = useSelector(getEditActive);
  const isDirty = useSelector(getEditDirty);
  const status = useSelector(getEditStatus);
  const parcel = useSelector(getEditParcel);
  const editing = useSelector(getEditing);
  const takeOver = useSelector(getTakeOver);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const start = useStartEditing();

  const schluesselId = landparcel?.flurstueck_schluessel?.id;
  const { keepDraft } = useEditDraft(
    useMemo(() => toEditDraft(editing), [editing])
  );
  // leaves edit mode but keeps the stored draft, so the lock-lost dialog
  // offers it
  const leaveLostSession = () => {
    keepDraft();
    dispatch(editEnded());
  };
  useHolderCheck(
    isEdit ? { type: CLASS.SCHLUESSEL, id: parcel.schluesselId } : undefined,
    editing.lock?.id,
    leaveLostSession
  );
  const {
    state: storedDraft,
    discard: discardStoredDraft,
    dismiss,
  } = useResumableDraft(
    !isEdit && schluesselId
      ? { type: CLASS.SCHLUESSEL, id: schluesselId }
      : undefined
  );
  const resumable =
    storedDraft.kind === "resumable" ? storedDraft.record : undefined;
  const lost = storedDraft.kind === "lockLost" ? storedDraft : undefined;
  const busy = status !== "idle";
  const starting = status === "starting";
  const ending = status === "ending";

  const reloadParcel = () =>
    dispatch(
      fetchFlurstueck(
        parcel.schluesselId,
        alkisLandparcel?.alkis_id,
        navigate,
        () => {}
      )
    );

  // saveEditing also ends edit mode
  const save = async () => {
    try {
      await dispatch(saveEditing());
      reloadParcel();
      message.success("Änderungen gespeichert");
      return true;
    } catch (error) {
      if (error instanceof LockLostError) {
        setEndDialogOpen(false);
        leaveLostSession();
      } else {
        showSaveError(error);
      }
      return false;
    }
  };

  const toggle = () => {
    if (busy) {
      return;
    }
    if (!isEdit) {
      start();
    } else if (isDirty) {
      setEndDialogOpen(true);
    } else {
      dispatch(discardEditing());
    }
  };

  const saveAndEnd = async () => {
    if (await save()) {
      setEndDialogOpen(false);
    }
  };

  const resumeDraft = () => {
    dispatch(editResumed(resumable.payload));
    dismiss();
  };

  const discardDraft = async () => {
    setDiscardingDraft(true);
    try {
      await discardStoredDraft();
    } finally {
      setDiscardingDraft(false);
    }
  };

  const withLockBusy = async (action) => {
    setLockBusy(true);
    try {
      await action();
    } finally {
      setLockBusy(false);
    }
  };

  const confirmTakeOver = () =>
    withLockBusy(async () => {
      await runStart(dispatch, {
        schluesselId: takeOver.schluesselId,
        urlParams: takeOver.urlParams,
        takeOver: true,
      });
      dispatch(takeOverClosed());
    });

  // starts edit mode with the draft stored in this browser
  const restartLost = (takeOver) =>
    withLockBusy(async () => {
      const { parcel: lostParcel, draft } = lost.record.payload;
      if (
        await runStart(dispatch, {
          schluesselId: lostParcel.schluesselId,
          urlParams: lostParcel.urlParams,
          takeOver,
          draft,
        })
      ) {
        dismiss();
      }
    });

  const discardAndEnd = async () => {
    await dispatch(discardEditing());
    setEndDialogOpen(false);
  };

  const canStart = isEdit || Boolean(schluesselId);
  const iconStyle = { paddingRight: "12px" };

  // one slot: pencil starts edit mode, save icon ends it (asking when dirty)
  const tooltip = starting
    ? "Bearbeitungsmodus wird gestartet…"
    : ending
    ? "Bearbeitungsmodus wird beendet…"
    : busy
    ? "Änderungen werden gespeichert…"
    : !canStart
    ? "Kein Flurstück geladen"
    : !isEdit
    ? "Bearbeitungsmodus starten"
    : isDirty
    ? "Änderungen speichern oder verwerfen"
    : "Bearbeitungsmodus beenden (keine Änderungen)";

  return (
    <>
      <Tooltip title={tooltip} placement="bottom">
        {busy ? (
          <span
            className="inline-block cursor-wait animate-spin rounded-full"
            style={{
              width: 14,
              height: 14,
              marginRight: "12px",
              border: "2px solid #d9d9d9",
              borderTopColor: "#1677ff",
              verticalAlign: "middle",
            }}
            data-test-id="toggle-edit-mode-loading"
          />
        ) : isEdit ? (
          <CheckOutlined
            className="text-sm cursor-pointer"
            style={{
              ...iconStyle,
              color: isDirty ? "#237804" : "#389E0D",
            }}
            onClick={toggle}
            data-test-id="save-edit-mode"
          />
        ) : (
          <EditOutlined
            className={`text-sm ${
              canStart ? "cursor-pointer" : "cursor-not-allowed"
            }`}
            style={{
              ...iconStyle,
              color: canStart ? undefined : "#bfbfbf",
            }}
            onClick={canStart ? toggle : undefined}
            data-test-id="toggle-edit-mode"
          />
        )}
      </Tooltip>
      <UnsavedChangesDialog
        open={endDialogOpen}
        onCancel={() => setEndDialogOpen(false)}
        onDiscard={discardAndEnd}
        onSave={saveAndEnd}
      />
      <ResumeDraftDialog
        record={resumable}
        objectLabel={`Flurstück ${displayParcel(
          resumable?.payload.parcel.label
        )}`}
        busy={discardingDraft}
        onResume={resumeDraft}
        onDiscard={discardDraft}
      />
      <LockLostDialog
        record={lost?.record}
        holder={lost?.holder}
        objectLabel={`Flurstück ${displayParcel(
          lost?.record.payload.parcel.label
        )}`}
        busy={lockBusy || discardingDraft}
        onRelock={() => restartLost(false)}
        onTakeOver={() => restartLost(true)}
        onDiscard={discardDraft}
        onLater={dismiss}
      />
      <TakeOverDialog
        lock={takeOver?.lock}
        objectLabel={`Flurstück ${displayParcel(takeOver?.keyString)}`}
        busy={lockBusy}
        onTakeOver={confirmTakeOver}
        onCancel={() => dispatch(takeOverClosed())}
      />
    </>
  );
};

export default EditControls;
