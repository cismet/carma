import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, InputNumber, Select, Spin } from "antd";
import { EuroOutlined, TagOutlined } from "@ant-design/icons";
import AdminAreaTable from "../AdminAreaTable";
import { adminTargets } from "../../../core/wizard/adminData";
import { explain } from "../../../core/wizard/errors";
import { formatKey } from "../../../core/wizard/keys";
import {
  gesamtpreis,
  loadUsageStammdaten,
  newUsageRow,
} from "../../../core/wizard/usageData";
import { compare, formatPrice } from "../../../core/tools/helper";

const LOADING = "Nutzungen werden geladen...";

const toOptions = (entries) =>
  entries
    .map((entry) => ({ value: entry.id, label: entry.bezeichnung }))
    .sort((a, b) => compare(a.label, b.label));

// Same order as the Java client: by schluessel, plain string comparison.
const bySchluessel = (a, b) => {
  const x = a.schluessel ?? "";
  const y = b.schluessel ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
};

const toNutzungsartOptions = (entries) =>
  [...entries]
    .sort(bySchluessel)
    .map((entry) => ({ value: entry.id, label: entry.bezeichnung }));

const columns = (stammdaten) => {
  const anlageklassen = stammdaten.anlageklassen.map((klasse) => ({
    value: klasse.id,
    label: klasse.bezeichnung,
  }));
  const nutzungsarten = toNutzungsartOptions(stammdaten.nutzungsarten);

  return (update) => [
    {
      key: "anlageklasse",
      width: 200,
      title: "Anlageklasse",
      dataIndex: "anlageklasseId",
      render: (anlageklasseId, record) => (
        <Select
          size="small"
          placeholder="Anlageklasse"
          className="w-full"
          getPopupContainer={() => document.body}
          options={anlageklassen}
          value={anlageklasseId}
          onChange={(next) => update(record.id, { anlageklasseId: next })}
        />
      ),
    },
    {
      key: "nutzungsartBezeichnung",
      width: 200,
      title: "Nutzungsarten-Bezeichnung",
      dataIndex: "nutzungsartId",
      render: (nutzungsartId, record) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Nutzungsart"
          className="w-full"
          getPopupContainer={() => document.body}
          options={nutzungsarten}
          value={nutzungsartId}
          onChange={(next) => update(record.id, { nutzungsartId: next })}
        />
      ),
    },
    {
      key: "flaeche",
      width: 110,
      title: "Fläche/m²",
      dataIndex: "flaeche",
      render: (flaeche, record) => (
        <InputNumber
          size="small"
          min={0}
          precision={0}
          className="w-full"
          value={flaeche}
          onChange={(next) => update(record.id, { flaeche: next ?? null })}
        />
      ),
    },
    {
      key: "quadratmeterpreis",
      width: 110,
      title: "m²-Preis",
      dataIndex: "quadratmeterpreis",
      render: (preis, record) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          decimalSeparator=","
          className="w-full"
          value={preis}
          onChange={(next) =>
            update(record.id, { quadratmeterpreis: next ?? null })
          }
        />
      ),
    },
  ];
};

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
  const jwt = useSelector((state) => state.auth.jwt);
  const [stammdaten, setStammdaten] = useState();
  const [loadError, setLoadError] = useState();
  const [activeIds, setActiveIds] = useState({});

  const targets = useMemo(() => adminTargets(value), [value]);
  const usage = value.usage ?? {};

  useEffect(() => {
    let cancelled = false;
    onProblem(LOADING);
    loadUsageStammdaten(jwt)
      .then((loaded) => {
        if (!cancelled) {
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
    () => (stammdaten ? columns(stammdaten) : undefined),
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
        description="Für diese Aktion gibt es kein Flurstück, dem Nutzungen zugeordnet werden können"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {targets.map(({ key }) => {
        const label = formatKey(key);
        const rows = usage[label] ?? [];
        const activeRow = rows.find((row) => row.id === activeIds[label]);
        return (
          <div key={label} className="flex flex-col gap-3">
            <UsageSummary
              nutzungsart={nutzungsartById.get(activeRow?.nutzungsartId)}
              gesamtpreis={activeRow ? gesamtpreis(activeRow) : null}
            />
            <AdminAreaTable
              title={targets.length > 1 ? label : undefined}
              rows={rows}
              columns={tableColumns}
              newRow={newUsageRow}
              scroll={{ x: "max-content" }}
              activeId={activeIds[label]}
              onActiveChange={(id) =>
                setActiveIds((previous) => ({ ...previous, [label]: id }))
              }
              onChange={(rows) =>
                onChange({ usage: { ...usage, [label]: rows } })
              }
            />
          </div>
        );
      })}
    </div>
  );
};

export default UsageStep;
