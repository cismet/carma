import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Modal, Tooltip, message } from "antd";
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
  saveEditing,
  startEditing,
  verifyEditLock,
} from "../../core/editing/session";

export const urlParamsOf = (searchParams) => ({
  gem: searchParams.get("gem"),
  flur: searchParams.get("flur"),
  fstck: searchParams.get("fstck"),
});

const showSaveError = (error) =>
  Modal.error({
    title: "Speichern fehlgeschlagen",
    content: (
      <span style={{ whiteSpace: "pre-line" }}>{errorMessage(error)}</span>
    ),
    centered: true,
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
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const schluesselId = landparcel?.flurstueck_schluessel?.id;
  const busy = status !== "idle";

  useEffect(() => {
    dispatch(verifyEditLock()).catch((error) =>
      message.error(errorMessage(error))
    );
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

  const confirmSave = async () => {
    setSaveDialogOpen(false);
    await save();
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
            onClick={canSave ? () => setSaveDialogOpen(true) : undefined}
            data-test-id="save-edit-mode"
          />
        </Tooltip>
      )}
      <Tooltip
        title={
          !canStart
            ? "Kein Flurstück geladen"
            : isEdit
            ? "Bearbeitungsmodus beenden"
            : "Bearbeitungsmodus starten"
        }
        placement="bottom"
      >
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
      </Tooltip>
      <Modal
        open={endDialogOpen}
        title="Bearbeitungsmodus beenden"
        centered
        onCancel={() => setEndDialogOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setEndDialogOpen(false)}>
            Abbrechen
          </Button>,
          <Button key="discard" danger disabled={busy} onClick={discardAndEnd}>
            Verwerfen
          </Button>,
          <Button
            key="save"
            type="primary"
            disabled={Boolean(lockHolder) || busy}
            onClick={saveAndEnd}
          >
            Speichern
          </Button>,
        ]}
      >
        Es gibt ungespeicherte Änderungen an {parcel?.label}. Sollen sie
        gespeichert oder verworfen werden?
      </Modal>
      <Modal
        open={saveDialogOpen}
        title="Änderungen speichern"
        okText="Speichern"
        cancelText="Abbrechen"
        onOk={confirmSave}
        onCancel={() => setSaveDialogOpen(false)}
      >
        Sollen die Änderungen an {parcel?.label} gespeichert werden?
      </Modal>
    </>
  );
};

export default EditControls;
