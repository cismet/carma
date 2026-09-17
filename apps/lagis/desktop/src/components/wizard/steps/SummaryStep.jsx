import React, { useEffect, useState } from "react";
import { Alert, Spin, Table } from "antd";
import { useSelector } from "react-redux";
import { checkAreas } from "../../../core/wizard/areaCheck";
import {
  SMALL_AREA_THRESHOLD_SQM,
  WIZARD_ACTIONS,
} from "../../../core/wizard/constants";

const formatArea = (area) =>
  `${Number(area ?? 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

/**
 * Which parcels are compared against which, taken from ResultingPanel's three
 * calls to checkGeometryAreas. For merging, the single new parcel is the
 * target and the members are measured against it; for the other two it is the
 * other way round.
 */
const partition = (value) => {
  if (value.action === WIZARD_ACTIONS.JOIN) {
    return {
      targetKeys: (value.resultKeys ?? []).filter(Boolean).slice(0, 1),
      resultKeys: value.joinKeys ?? [],
    };
  }
  if (value.action === WIZARD_ACTIONS.SPLIT_JOIN) {
    return {
      targetKeys: value.joinKeys ?? [],
      resultKeys: (value.resultKeys ?? []).filter(Boolean),
    };
  }
  return {
    targetKeys: value.splitKey ? [value.splitKey] : [],
    resultKeys: (value.resultKeys ?? []).filter(Boolean),
  };
};

/** Port of SummaryPanel — the area comparison shown before finishing. */
const SummaryStep = ({ value, onProblem }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    onProblem("Prüfe Flurstücke...");
    (async () => {
      try {
        const result = await checkAreas(partition(value), jwt);
        if (!cancelled) {
          setState({ loading: false, result });
          onProblem(null);
        }
      } catch (e) {
        if (!cancelled) {
          setState({ loading: false, error: e.message });
          onProblem("Fehler beim Prüfen der Geometrien");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2">
        <Spin size="small" /> Flurstücke werden geprüft...
      </div>
    );
  }
  if (state.error) {
    return <Alert type="error" message={state.error} />;
  }

  const { targets, results, sumTargets, sumResults, difference } = state.result;
  const columns = [
    { title: "Flurstück", dataIndex: "label", key: "label" },
    {
      title: "Fläche",
      dataIndex: "area",
      key: "area",
      align: "right",
      render: (area, row) =>
        row.missing ? <span className="text-amber-600">unbekannt</span> : formatArea(area),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Table
        size="small"
        pagination={false}
        rowKey="label"
        columns={columns}
        dataSource={targets}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell>Summe</Table.Summary.Cell>
            <Table.Summary.Cell align="right">
              {formatArea(sumTargets)}
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
      <Table
        size="small"
        pagination={false}
        rowKey="label"
        columns={columns}
        dataSource={results}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell>Summe</Table.Summary.Cell>
            <Table.Summary.Cell align="right">
              {formatArea(sumResults)}
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
      <div className="font-medium">Differenz: {formatArea(difference)}</div>
      {state.result.hasSmallArea && (
        <Alert
          type="warning"
          message={`Achtung! Es entstehen Flurstücke < ${SMALL_AREA_THRESHOLD_SQM} m².`}
          description="Bitte die Eintragung der Belastungen und Pachtverträge kontrollieren."
        />
      )}
      {state.result.missingGeometry.length > 0 && (
        <Alert
          type="info"
          message="Zu diesen Flurstücken konnte keine Geometrie gefunden werden"
          description={state.result.missingGeometry.join(", ")}
        />
      )}
    </div>
  );
};

export default SummaryStep;
