import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Spin } from "antd";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
import DienststellenEditor from "../DienststellenEditor";
import ParcelSelector, { activeTarget } from "../ParcelSelector";
import EditableTable from "../../editing/EditableTable";
import NoteEditor from "../../editing/NoteEditor";
import {
  dienststelleColumn,
  numberColumn,
  rolleArtColumn,
  strassenColumn,
} from "../../editing/columns";
import { explain } from "../../../core/wizard/errors";
import { formatKey } from "../../../core/wizard/keys";
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
import { ensureAdminStammdaten } from "../../../store/slices/stammdaten";

const LOADING = "Verwaltungsbereiche werden geladen...";

const SECTIONS = {
  [ADMIN_SECTION.DIENSTSTELLEN]: {
    field: "dienststellen",
    newRow: newDienststelleRow,
    columns: (stammdaten) => (update) =>
      [
        dienststelleColumn(
          verwaltung.dienststellen.dienststelleCol,
          stammdaten.dienststellen,
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
          stammdaten.dienststellen,
          update
        ),
        rolleArtColumn(
          verwaltung.zusatzlicheRollen.rolleCol,
          stammdaten.rolleArten,
          update
        ),
      ],
  },
  [ADMIN_SECTION.STRASSENFRONTEN]: {
    field: "strassenfronten",
    newRow: newStrassenfrontRow,
    columns: (stammdaten) => (update) =>
      [
        strassenColumn(
          verwaltung.strassen.strasseCol,
          stammdaten.strassennamen,
          update
        ),
        numberColumn(verwaltung.strassen.lange, "laenge", update),
      ],
  },
};

const AdminStep = ({ section, value, onChange, onProblem, onHideProblem }) => {
  const dispatch = useDispatch();
  const jwt = useSelector((state) => state.auth.jwt);
  const [stammdaten, setStammdaten] = useState();
  const [loadError, setLoadError] = useState();

  const targets = useMemo(() => adminTargets(value), [value]);
  const admin = value.admin ?? {};

  useEffect(() => {
    let cancelled = false;
    onProblem(LOADING);
    Promise.all([dispatch(ensureAdminStammdaten()), loadAdminData(value, jwt)])
      .then(([loadedStammdaten, parcels]) => {
        if (cancelled) {
          return;
        }
        if (Object.keys(parcels).length) {
          onChange({ admin: { ...value.admin, ...parcels } });
        }
        setStammdaten(loadedStammdaten);
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
      <EditableTable
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
