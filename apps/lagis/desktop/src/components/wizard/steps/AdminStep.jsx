import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Input, InputNumber, Modal, Select, Spin, Switch } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
import DienststellenEditor from "../DienststellenEditor";
import ParcelSelector, { activeTarget } from "../ParcelSelector";
import AdminAreaTable, {
  ColorMark,
  dienststelleLabel,
} from "../AdminAreaTable";
import { explain } from "../../../core/wizard/errors";
import { formatKey } from "../../../core/wizard/keys";
import { compare, getColorFromCode } from "../../../core/tools/helper";
import {
  ADMIN_SECTION,
  adminTargets,
  hasNonStaedtischTargets,
  findAdminProblem,
  loadAdminData,
  newDienststelleRow,
  newRolleRow,
  newStrassenfrontRow,
} from "../../../core/wizard/adminData";

const LOADING = "Verwaltungsbereiche werden geladen...";

const dienststelleColumn = (title, stammdaten, update) => {
  const byId = new Map(stammdaten.dienststellen.map((d) => [d.id, d]));
  const options = stammdaten.dienststellen
    .map((d) => ({ value: d.id, label: dienststelleLabel(d) }))
    .sort((a, b) => compare(a.label, b.label));
  return {
    title,
    dataIndex: "dienststelleId",
    render: (dienststelleId, record) => (
      <div className="flex items-center">
        <ColorMark
          color={
            dienststelleId &&
            getColorFromCode(
              byId.get(dienststelleId)?.farbeArrayRelationShip?.[0]
                ?.rgb_farbwert
            )
          }
        />
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Dienststelle wählen"
          className="w-full"
          options={options}
          value={dienststelleId}
          onChange={(next) => update(record.id, { dienststelleId: next })}
        />
      </div>
    ),
  };
};

const numberColumn = (title, dataIndex, update) => ({
  title,
  dataIndex,
  render: (number, record) => (
    <InputNumber
      size="small"
      min={0}
      decimalSeparator=","
      precision={2}
      className="w-full"
      value={number}
      onChange={(next) => update(record.id, { [dataIndex]: next ?? null })}
    />
  ),
});

const strassenOptions = (names) => [
  { value: "", label: <i>keine</i> },
  ...names.map((name) => ({ value: name, label: name })),
];

const SECTIONS = {
  [ADMIN_SECTION.DIENSTSTELLEN]: {
    field: "dienststellen",
    newRow: newDienststelleRow,
    columns: (stammdaten) => (update) =>
      [
        dienststelleColumn(
          verwaltung.dienststellen.dienststelleCol,
          stammdaten,
          update
        ),
        numberColumn(verwaltung.dienststellen.flacheCol, "flaeche", update),
      ],
  },
  [ADMIN_SECTION.ROLLEN]: {
    field: "rollen",
    newRow: newRolleRow,
    columns: (stammdaten) => (update) =>
      [
        dienststelleColumn(
          verwaltung.zusatzlicheRollen.dienststelleCol,
          stammdaten,
          update
        ),
        {
          title: verwaltung.zusatzlicheRollen.rolleCol,
          dataIndex: "rolleArtId",
          render: (rolleArtId, record) => (
            <Select
              size="small"
              placeholder="Rolle wählen"
              className="w-full"
              options={stammdaten.rolleArten.map((art) => ({
                value: art.id,
                label: art.name,
              }))}
              value={rolleArtId}
              onChange={(next) => update(record.id, { rolleArtId: next })}
            />
          ),
        },
      ],
  },
  [ADMIN_SECTION.STRASSENFRONTEN]: {
    field: "strassenfronten",
    newRow: newStrassenfrontRow,
    columns: (stammdaten) => (update) =>
      [
        {
          title: verwaltung.strassen.strasseCol,
          dataIndex: "strassenname",
          render: (strassenname, record) => (
            <Select
              size="small"
              showSearch
              className="w-full"
              optionFilterProp="value"
              options={strassenOptions(stammdaten.strassennamen)}
              value={strassenname ?? ""}
              onChange={(next) =>
                update(record.id, { strassenname: next ?? "" })
              }
            />
          ),
        },
        numberColumn(verwaltung.strassen.lange, "laenge", update),
      ],
  },
};

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
      <div
        className="flex items-center gap-3 rounded-md px-4 py-3"
        style={
          parcel.sperre
            ? { border: "1px solid #ffe58f", background: "#fffbe6" }
            : { border: "1px solid #f0f0f0", background: "#fafafa" }
        }
      >
        <LockOutlined
          style={{ color: parcel.sperre ? "#d48806" : "#8c8c8c", fontSize: 18 }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{verwaltung.bemerkungen.checkbox}</div>
          <div className="truncate text-xs text-gray-500">
            {parcel.sperre
              ? `Grund: ${parcel.sperreBemerkung}`
              : "Markiert das Flurstück als gesperrt, mit Begründung"}
          </div>
        </div>
        <Switch checked={parcel.sperre} onChange={handleSperre} />
      </div>
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

const AdminStep = ({ section, value, onChange, onProblem, onHideProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [stammdaten, setStammdaten] = useState();
  const [loadError, setLoadError] = useState();

  const targets = useMemo(() => adminTargets(value), [value]);
  const admin = value.admin ?? {};

  useEffect(() => {
    let cancelled = false;
    onProblem(LOADING);
    loadAdminData(value, jwt)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (Object.keys(loaded.parcels).length) {
          onChange({ admin: { ...value.admin, ...loaded.parcels } });
        }
        setStammdaten(loaded.stammdaten);
      })
      .catch((e) => {
        if (!cancelled) {
          const message = explain(
            "Die Verwaltungsbereiche konnten nicht geladen werden",
            e
          );
          setLoadError(message);
          onProblem(message);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (stammdaten) {
      onProblem(findAdminProblem(section, value.admin, targets));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stammdaten, section, value.admin, targets]);

  const showsMap =
    section === ADMIN_SECTION.DIENSTSTELLEN &&
    targets.some(({ key }) => admin[formatKey(key)]?.dienststellen.length >= 2);
  useEffect(() => {
    onHideProblem(showsMap);
  }, [showsMap, onHideProblem]);
  useEffect(() => () => onHideProblem(false), [onHideProblem]);

  if (loadError) {
    return null;
  }
  if (!stammdaten) {
    return (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );
  }
  if (!targets.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="Verwaltungsbereiche"
        description={
          hasNonStaedtischTargets(value)
            ? "Verwaltungsbereiche können nur für städtische Flurstücke gepflegt werden"
            : "Für diese Aktion gibt es kein Flurstück, dem Verwaltungsbereiche zugeordnet werden können"
        }
      />
    );
  }

  const patchParcel = (label, changes) =>
    onChange({ admin: { ...admin, [label]: { ...admin[label], ...changes } } });

  const config = SECTIONS[section];

  const label = formatKey(activeTarget(targets, value.activeParcel).key);
  const parcel = admin[label];

  const renderParcel = () => {
    if (!parcel) {
      return null;
    }
    if (!config) {
      return (
        <NoteEditor
          key={label}
          parcel={parcel}
          onChange={(changes) => patchParcel(label, changes)}
        />
      );
    }
    if (section === ADMIN_SECTION.DIENSTSTELLEN) {
      return (
        <DienststellenEditor
          key={label}
          parcel={parcel}
          dienststellen={stammdaten.dienststellen}
          columns={config.columns(stammdaten)}
          newRow={() => config.newRow(parcel)}
          onChange={(rows) => patchParcel(label, { dienststellen: rows })}
        />
      );
    }
    return (
      <AdminAreaTable
        key={label}
        rows={parcel[config.field]}
        columns={config.columns(stammdaten)}
        newRow={() => config.newRow(parcel)}
        onChange={(rows) => patchParcel(label, { [config.field]: rows })}
      />
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <ParcelSelector
        targets={targets}
        value={label}
        onChange={(next) => onChange({ activeParcel: next })}
      />
      {renderParcel()}
    </div>
  );
};

export default AdminStep;
