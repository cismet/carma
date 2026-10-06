import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Spin } from "antd";
import { EuroOutlined, TagOutlined } from "@ant-design/icons";
import EditableTable from "../../editing/EditableTable";
import { usageColumns } from "../../editing/columns";
import ParcelSelector, { activeTarget } from "../ParcelSelector";
import {
  adminTargets,
  hasNonStaedtischTargets,
} from "../../../core/wizard/adminData";
import { explain } from "../../../core/wizard/errors";
import { formatKey } from "../../../core/wizard/keys";
import {
  gesamtpreis,
  loadInheritedUsage,
  newUsageRow,
} from "../../../core/wizard/usageData";
import { formatPrice } from "../../../core/tools/helper";
import { ensureStammdatenList } from "../../../store/slices/stammdaten";

const LOADING = "Nutzungen werden geladen...";

const UsageSummary = ({ nutzungsart, gesamtpreis: preis }) => (
  <div className="flex flex-col gap-1 text-sm">
    <span className="flex items-center gap-2">
      <TagOutlined />
      Nutzungsart: {nutzungsart ? nutzungsart.schluessel : "–"}
    </span>
    <span className="flex items-center gap-2">
      <EuroOutlined />
      Gesamtpreis: {preis === null ? "–" : formatPrice(preis)}
    </span>
  </div>
);

const UsageStep = ({ value, onChange, onProblem }) => {
  const dispatch = useDispatch();
  const jwt = useSelector((state) => state.auth.jwt);
  const [stammdaten, setStammdaten] = useState();
  const [loadError, setLoadError] = useState();
  const [activeIds, setActiveIds] = useState({});

  const targets = useMemo(() => adminTargets(value), [value]);
  const usage = value.usage ?? {};

  useEffect(() => {
    let cancelled = false;
    onProblem(LOADING);
    Promise.all([
      dispatch(ensureStammdatenList("nutzung")),
      loadInheritedUsage(value, jwt),
    ])
      .then(([loaded, inherited]) => {
        if (!cancelled) {
          if (Object.keys(inherited).length) {
            onChange({ usage: { ...value.usage, ...inherited } });
          }
          setStammdaten(loaded);
          onProblem(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const message = explain(
            "Die Nutzungsarten konnten nicht geladen werden",
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
  }, []);

  const nutzungsartById = useMemo(
    () =>
      new Map((stammdaten?.nutzungsarten ?? []).map((art) => [art.id, art])),
    [stammdaten]
  );

  const tableColumns = useMemo(
    () => (stammdaten ? usageColumns(stammdaten) : undefined),
    [stammdaten]
  );

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
        message="Nutzung"
        description={
          hasNonStaedtischTargets(value)
            ? "Nutzungen können nur für städtische Flurstücke gepflegt werden"
            : "Für diese Aktion gibt es kein Flurstück, dem Nutzungen zugeordnet werden können"
        }
      />
    );
  }

  const label = formatKey(activeTarget(targets, value.activeParcel).key);
  const rows = usage[label] ?? [];
  const activeRow = rows.find((row) => row.id === activeIds[label]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <ParcelSelector
        targets={targets}
        value={label}
        onChange={(next) => onChange({ activeParcel: next })}
      />
      <div key={label} className="flex flex-col gap-3">
        <UsageSummary
          nutzungsart={nutzungsartById.get(activeRow?.nutzungsartId)}
          gesamtpreis={activeRow ? gesamtpreis(activeRow) : null}
        />
        <EditableTable
          rows={rows}
          columns={tableColumns}
          newRow={() => newUsageRow(rows[rows.length - 1])}
          scroll={{ x: "max-content" }}
          activeId={activeIds[label]}
          onActiveChange={(id) =>
            setActiveIds((previous) => ({ ...previous, [label]: id }))
          }
          onChange={(rows) => onChange({ usage: { ...usage, [label]: rows } })}
        />
      </div>
    </div>
  );
};

export default UsageStep;
