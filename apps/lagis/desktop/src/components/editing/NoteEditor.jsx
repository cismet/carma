import React, { useState } from "react";
import { Input, Modal, Switch } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

export const SperreCard = ({ sperre, reason, onChange, disabled = false }) => (
  <div
    className="flex items-center gap-3 rounded-md px-4 py-3"
    style={
      sperre
        ? { border: "1px solid #ffe58f", background: "#fffbe6" }
        : { border: "1px solid #f0f0f0", background: "#fafafa" }
    }
  >
    <LockOutlined
      style={{ color: sperre ? "#d48806" : "#8c8c8c", fontSize: 18 }}
    />
    <div className="min-w-0 flex-1">
      <div className="font-medium">{verwaltung.bemerkungen.checkbox}</div>
      <div className="truncate text-xs text-gray-500">
        {sperre
          ? `Grund: ${reason}`
          : "Markiert das Flurstück als gesperrt, mit Begründung"}
      </div>
    </div>
    <Switch checked={sperre} onChange={onChange} disabled={disabled} />
  </div>
);

// A Sperre needs a reason; it is only a marker and blocks nothing.
const NoteEditor = ({ parcel, onChange }) => {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const handleSperre = (checked) => {
    if (checked) {
      setReason("");
      setAsking(true);
    } else {
      onChange({ sperre: false, sperreBemerkung: "" });
    }
  };

  const confirm = () => {
    onChange({ sperre: true, sperreBemerkung: reason.trim() });
    setAsking(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <SperreCard
        sperre={parcel.sperre}
        reason={parcel.sperreBemerkung}
        onChange={handleSperre}
      />
      <Input.TextArea
        rows={6}
        placeholder="Bemerkung zum Flurstück eingeben"
        style={{ resize: "none", background: "#fff" }}
        value={parcel.bemerkung}
        onChange={(event) => onChange({ bemerkung: event.target.value })}
      />
      <Modal
        open={asking}
        title="Sperre setzen"
        okText="OK"
        cancelText="Abbrechen"
        okButtonProps={{ disabled: !reason.trim() }}
        onOk={confirm}
        onCancel={() => setAsking(false)}
        destroyOnClose
        centered
      >
        <div className="mb-2">Bitte eine Bemerkung zur Sperre angeben.</div>
        <Input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onPressEnter={() => reason.trim() && confirm()}
        />
      </Modal>
    </div>
  );
};

export default NoteEditor;
