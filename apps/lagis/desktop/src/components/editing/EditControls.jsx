import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Modal, Tooltip, message } from "antd";
import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import {
  getAlkisLandparcel,
  getLandparcel,
  fetchFlurstueck,
} from "../../store/slices/lagis";
import {
  getEditActive,
  getEditDirty,
  getEditLockHolder,
  getEditParcel,
  getEditStatus,
} from "../../store/slices/editing";
import {
  discardEditing,
  errorMessage,
  releaseStaleLocks,
  saveEditing,
  startEditing,
  verifyEditLock,
} from "../../core/editing/session";
import UnsavedChangesDialog from "./UnsavedChangesDialog";
import { DraftValidationError } from "../../core/editing/validation";

export const urlParamsOf = (searchParams) => ({
  gem: searchParams.get("gem"),
  flur: searchParams.get("flur"),
  fstck: searchParams.get("fstck"),
});

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
  const [searchParams] = useSearchParams();
  const landparcel = useSelector(getLandparcel);
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const isEdit = useSelector(getEditActive);
  const isDirty = useSelector(getEditDirty);
  const status = useSelector(getEditStatus);
  const parcel = useSelector(getEditParcel);
  const lockHolder = useSelector(getEditLockHolder);
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  const schluesselId = landparcel?.flurstueck_schluessel?.id;
  const busy = status !== "idle";
  const starting = status === "starting";

  useEffect(() => {
    dispatch(verifyEditLock())
      .catch((error) => message.error(errorMessage(error)))
      // after verify, so it can't delete locks the restored session reuses
      .finally(() => dispatch(releaseStaleLocks()));
    // only once, for an edit session restored after a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockHolder) {
      message.warning(
        `${parcel?.label} wird inzwischen von ${lockHolder} bearbeitet. Ihre Änderungen können nicht gespeichert werden.`
      );
    }
  }, [lockHolder, parcel?.label]);

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
      showSaveError(error);
      return false;
    }
  };

  const toggle = () => {
    if (busy) {
      return;
    }
    if (!isEdit) {
      dispatch(
        startEditing({ schluesselId, urlParams: urlParamsOf(searchParams) })
      ).catch((error) => message.error(errorMessage(error)));
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

  const discardAndEnd = async () => {
    await dispatch(discardEditing());
    setEndDialogOpen(false);
  };

  const canStart = isEdit || Boolean(schluesselId);
  const canSave = isDirty && !lockHolder && !busy;

  return (
    <>
      {isEdit && (
        <Tooltip
          title={
            lockHolder
              ? `Gesperrt von ${lockHolder}`
              : isDirty
              ? "Alle Änderungen speichern"
              : "Keine Änderungen"
          }
          placement="bottom"
        >
          <SaveOutlined
            className={`text-sm ${
              canSave ? "cursor-pointer" : "cursor-not-allowed"
            }`}
            style={{
              paddingRight: "12px",
              color: canSave ? undefined : "#bfbfbf",
            }}
            onClick={canSave ? () => setEndDialogOpen(true) : undefined}
            data-test-id="save-edit-mode"
          />
        </Tooltip>
      )}
      <Tooltip
        title={
          starting
            ? "Bearbeitungsmodus wird gestartet…"
            : !canStart
            ? "Kein Flurstück geladen"
            : isEdit
            ? "Bearbeitungsmodus beenden"
            : "Bearbeitungsmodus starten"
        }
        placement="bottom"
      >
        {starting ? (
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
        ) : (
          <EditOutlined
            className={`text-sm ${
              canStart ? "cursor-pointer" : "cursor-not-allowed"
            }`}
            style={{
              paddingRight: "12px",
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
    </>
  );
};

export default EditControls;
