import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Steps } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";

import ActionChooserStep from "./steps/ActionChooserStep";
import CreateStep from "./steps/CreateStep";
import RenameStep from "./steps/RenameStep";
import HistoricStep from "./steps/HistoricStep";
import ActivateStep from "./steps/ActivateStep";
import ChangeKindStep from "./steps/ChangeKindStep";
import SplitChooseStep from "./steps/SplitChooseStep";
import JoinChooseStep from "./steps/JoinChooseStep";
import ResultingStep from "./steps/ResultingStep";
import SummaryStep from "./steps/SummaryStep";
import HistoricRebeMipaDialog from "./HistoricRebeMipaDialog";
import GraphQLPanel from "./GraphQLPanel";

import { STEP, getSteps } from "../../core/wizard/flow";
import { ACTION_TITLES, WIZARD_ACTIONS } from "../../core/wizard/constants";
import { findLock } from "../../core/wizard/locks";
import { findRebeAndMipa } from "../../core/wizard/areaCheck";
import { runWizardAction } from "../../core/wizard/operations";
import useStammdaten from "../../core/wizard/useStammdaten";
import { isRawVisible } from "../../core/wizard/devMode";
import { setLoggingEnabled } from "../../core/wizard/gqlLog";

import { getLogin } from "../../store/slices/auth";
import { getflurstuecke } from "../../store/slices/landParcels";
import { getLandparcelInternaDataStructure } from "../../store/slices/lagis";
import { getCurrentLParcelNav } from "../../store/slices/lpHistoryNav";
import { removeLeadingZeros } from "../../core/tools/helper";

const CHOOSE_ACTION_PROBLEM = "Bitte wählen Sie eine der obigen Aktionen aus";

/** Keys that have to be free of a Sperre before the step may be left. */
const keysToCheck = (stepId, data) => {
  switch (stepId) {
    case STEP.RENAME:
      return [data.renameKey];
    case STEP.HISTORIC:
      return [data.historicKey];
    case STEP.ACTIVATE:
      return [data.activateKey];
    case STEP.CHANGE_KIND:
      return [data.changeKey];
    case STEP.SPLIT_CHOOSE:
      return [data.splitKey];
    case STEP.JOIN_CHOOSE:
      return data.joinKeys ?? [];
    default:
      return [];
  }
};

/**
 * Port of ContinuationWizard — the Flurstück-Assistent.
 *
 * Step 0 picks the action, the following steps are the branch for it. The
 * footer mirrors the Swing wizard: Zurück / Weiter / Fertigstellen, with the
 * problem line above it that blocks forward navigation while it is set.
 */

const LandParcelWizard = ({ open, onClose, showGraphQL = true }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [, setUrlParams] = useSearchParams();
  const jwt = useSelector((state) => state.auth.jwt);
  const accountName = useSelector(getLogin);
  const structure = useSelector(getLandparcelInternaDataStructure);
  const currentKeyString = useSelector(getCurrentLParcelNav);
  const { arten } = useStammdaten();

  const [data, setData] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [problem, setProblem] = useState(CHOOSE_ACTION_PROBLEM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState();
  const [error, setError] = useState();
  const [rebeMipaPrompt, setRebeMipaPrompt] = useState();
  const showRaw = useMemo(
    () => (showGraphQL === undefined ? isRawVisible() : showGraphQL),
    [showGraphQL]
  );
  const [tab, setTab] = useState("wizard");

  // no panel, no recording
  useEffect(() => setLoggingEnabled(showRaw), [showRaw]);

  const steps = useMemo(() => getSteps(data.action), [data.action]);
  const currentStep = steps[stepIndex];
  const isLast = Boolean(data.action) && stepIndex === steps.length - 1;

  const reset = () => {
    setData({});
    setStepIndex(0);
    setProblem(CHOOSE_ACTION_PROBLEM);
    setResult(undefined);
    setError(undefined);
    setRebeMipaPrompt(undefined);
  };

  const patch = (changes) =>
    setData((previous) => ({ ...previous, ...changes }));

  /** Changing the action throws away everything the old branch collected. */
  const handleActionChange = ({ action }) => {
    setData({ action });
    setProblem(null);
  };

  const handleClose = () => {
    if (result || !data.action) {
      reset();
      onClose();
      return;
    }
    Modal.confirm({
      title: "Möchten Sie den Bearbeitungsvorgang beenden?",
      okText: "Ja",
      cancelText: "Nein",
      onOk: () => {
        reset();
        onClose();
      },
    });
  };

  const checkLocks = async () => {
    for (const key of keysToCheck(currentStep.id, data)) {
      if (!key?.id) {
        continue;
      }
      const lock = await findLock(key.id, jwt);
      if (lock) {
        setProblem(
          `Ausgewähltes Flurstück ist gesperrt von Benutzer: ${lock.user_string}`
        );
        return false;
      }
    }
    return true;
  };

  const handleNext = async () => {
    setBusy(true);
    try {
      if (await checkLocks()) {
        setProblem(null);
        setStepIndex(stepIndex + 1);
      }
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buildPayload = (rebeMipa) => {
    switch (data.action) {
      case WIZARD_ACTIONS.CREATE:
        return {
          key: data.createKey,
          isStaedtisch: data.isStaedtisch ?? true,
        };
      case WIZARD_ACTIONS.RENAME:
        return { oldKey: data.renameKey, newKey: data.createKey };
      case WIZARD_ACTIONS.HISTORIC:
        return {
          key: data.historicKey,
          date: data.historicDate ?? new Date(),
          rebeMipa,
        };
      case WIZARD_ACTIONS.ACTIVATE:
        return { key: data.activateKey };
      case WIZARD_ACTIONS.CHANGE_KIND:
        return {
          key: data.changeKey,
          newArt: arten?.find(
            (art) => art.bezeichnung === data.newArtBezeichnung
          ),
        };
      case WIZARD_ACTIONS.SPLIT:
        return { key: data.splitKey, resultKeys: data.resultKeys ?? [] };
      case WIZARD_ACTIONS.JOIN:
        return {
          memberKeys: data.joinKeys ?? [],
          resultKey: (data.resultKeys ?? [])[0],
        };
      case WIZARD_ACTIONS.SPLIT_JOIN:
        return {
          memberKeys: data.joinKeys ?? [],
          resultKeys: data.resultKeys ?? [],
        };
      default:
        return {};
    }
  };

  const execute = async (rebeMipa) => {
    setBusy(true);
    setError(undefined);
    try {
      if (!(await checkLocks())) {
        return;
      }
      const outcome = await runWizardAction(
        data.action,
        buildPayload(rebeMipa),
        {
          jwt,
          accountName,
          currentKeyString,
        }
      );
      setResult(outcome);
      // the parcel list has changed — reload it so the choosers and the search
      // see the new keys, which is what reloadFlurstueckKeys() did in Swing.
      // UserBar rebuilds the lookup as soon as the new list lands in redux.
      dispatch(getflurstuecke(navigate));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    // Setting a parcel historic asks about its rights and leases first.
    if (data.action === WIZARD_ACTIONS.HISTORIC) {
      setBusy(true);
      try {
        const found = await findRebeAndMipa(data.historicKey, structure, jwt);
        if (found.rebe.length || found.mipa.length) {
          setRebeMipaPrompt(found);
          return;
        }
      } catch (e) {
        setError(e.message);
        return;
      } finally {
        setBusy(false);
      }
    }
    await execute();
  };

  const switchToResult = () => {
    const key = result?.keys?.[0];
    if (!key?.gemarkung) {
      return;
    }
    setUrlParams({
      gem: key.gemarkung.bezeichnung,
      flur: String(key.flur),
      fstck: removeLeadingZeros(`${key.zaehler}/${key.nenner ?? 0}`).replace(
        "/",
        "-"
      ),
    });
    reset();
    onClose();
  };

  const renderStep = () => {
    const props = { value: data, onChange: patch, onProblem: setProblem };
    switch (currentStep.id) {
      case STEP.CHOOSE_ACTION:
        return <ActionChooserStep value={data} onChange={handleActionChange} />;
      case STEP.CREATE:
        return <CreateStep {...props} />;
      case STEP.RENAME:
        return <RenameStep {...props} />;
      case STEP.HISTORIC:
        return <HistoricStep {...props} />;
      case STEP.ACTIVATE:
        return <ActivateStep {...props} />;
      case STEP.CHANGE_KIND:
        return <ChangeKindStep {...props} />;
      case STEP.SPLIT_CHOOSE:
        return <SplitChooseStep {...props} />;
      case STEP.JOIN_CHOOSE:
        return <JoinChooseStep {...props} />;
      case STEP.RESULTING:
        return <ResultingStep {...props} />;
      case STEP.SUMMARY:
        return <SummaryStep {...props} />;
      default:
        return null;
    }
  };

  const footer = result
    ? [
        result.keys?.[0]?.gemarkung && (
          <Button key="switch" type="primary" onClick={switchToResult}>
            Zum Flurstück wechseln
          </Button>
        ),
        <Button key="close" onClick={handleClose}>
          Schließen
        </Button>,
      ].filter(Boolean)
    : [
        <Button key="cancel" onClick={handleClose} disabled={busy}>
          Abbrechen
        </Button>,
        <Button
          key="prev"
          onClick={() => {
            setStepIndex(stepIndex - 1);
            setProblem(null);
          }}
          disabled={stepIndex === 0 || busy}
        >
          Zurück
        </Button>,
        isLast ? (
          <Button
            key="finish"
            type="primary"
            loading={busy}
            disabled={Boolean(problem) || !data.action}
            onClick={handleFinish}
          >
            Fertigstellen
          </Button>
        ) : (
          <Button
            key="next"
            type="primary"
            loading={busy}
            disabled={Boolean(problem)}
            onClick={handleNext}
          >
            Weiter
          </Button>
        ),
      ];

  return (
    <>
      <Modal
        open={open}
        title={data.action ? ACTION_TITLES[data.action] : "Flurstück Assistent"}
        width={760}
        onCancel={handleClose}
        maskClosable={false}
        footer={footer}
      >
        {showRaw && (
          <div className="flex gap-1 border-b border-gray-200 -mt-2">
            {[
              { key: "wizard", label: "Assistent" },
              { key: "graphql", label: "GraphQL" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className="px-3 py-2 text-sm bg-transparent border-none cursor-pointer"
                style={{
                  color: tab === item.key ? "#1677ff" : "#6b7280",
                  borderBottom:
                    tab === item.key
                      ? "2px solid #1677ff"
                      : "2px solid transparent",
                  fontWeight: tab === item.key ? 500 : 400,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {showRaw && tab === "graphql" && (
          <div className="py-3">
            <GraphQLPanel />
          </div>
        )}

        {/* kept mounted rather than unmounted: the choosers hold the typed
            Flurstück in local state, which switching tabs would discard */}
        <div
          className="flex gap-6 py-2"
          style={{
            minHeight: 320,
            display: showRaw && tab === "graphql" ? "none" : "flex",
          }}
        >
          <Steps
            direction="vertical"
            size="small"
            current={stepIndex}
            style={{ width: 190 }}
            items={steps.map((step) => ({ title: step.title }))}
          />
          <div className="flex-1 flex flex-col justify-between">
            <div>
              {result ? (
                <Alert
                  type="success"
                  message="Aktion erfolgreich"
                  description={
                    <span style={{ whiteSpace: "pre-line" }}>
                      {result.message}
                    </span>
                  }
                />
              ) : (
                renderStep()
              )}
              {error && (
                <Alert
                  className="mt-3"
                  type="error"
                  message="Die Aktion ist fehlgeschlagen"
                  description={
                    <span style={{ whiteSpace: "pre-line" }}>{error}</span>
                  }
                />
              )}
            </div>
            {!result && problem && (
              <div className="text-blue-700 text-sm mt-3">{problem}</div>
            )}
          </div>
        </div>
      </Modal>

      <HistoricRebeMipaDialog
        open={Boolean(rebeMipaPrompt)}
        historicDate={data.historicDate ?? new Date()}
        rebeCount={rebeMipaPrompt?.rebe.length ?? 0}
        mipaCount={rebeMipaPrompt?.mipa.length ?? 0}
        onCancel={() => {
          setRebeMipaPrompt(undefined);
          setBusy(false);
          setError("Die Aktion wurde vom Benutzer abgebrochen.");
        }}
        onApply={async (dates) => {
          const found = rebeMipaPrompt;
          setRebeMipaPrompt(undefined);
          await execute({ ...found, ...dates });
        }}
      />
    </>
  );
};

export default LandParcelWizard;
