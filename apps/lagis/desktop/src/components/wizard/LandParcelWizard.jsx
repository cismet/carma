import React, { useEffect, useMemo, useState } from "react";
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
import AdminAreasStep from "./steps/AdminAreasStep";
import UsageStep from "./steps/UsageStep";
import HistoricRebeMipaDialog from "./HistoricRebeMipaDialog";
import WizardModal from "./WizardModal";
import WizardHeader from "./WizardHeader";
import WizardFooter from "./WizardFooter";

import { STEP, getSteps } from "../../core/wizard/flow";
import { ACTION_TITLES, WIZARD_ACTIONS } from "../../core/wizard/constants";
import { findLock } from "../../core/wizard/locks";
import { explain } from "../../core/wizard/errors";
import { findRebeAndMipa } from "../../core/wizard/areaCheck";
import { fetchFlurstueckBySchluesselId } from "../../core/wizard/api";
import { formatKey } from "../../core/wizard/keys";
import { runWizardAction } from "../../core/wizard/operations";
import useStammdaten from "../../core/wizard/useStammdaten";
import { setLoggingEnabled } from "../../core/wizard/gqlLog";

import { getLogin } from "../../store/slices/auth";
import { getflurstuecke } from "../../store/slices/landParcels";
import { getCurrentLParcelNav } from "../../store/slices/lpHistoryNav";
import { removeLeadingZeros } from "../../core/tools/helper";

const CHOOSE_ACTION_PROBLEM = "Bitte wählen Sie eine der obigen Aktionen aus";

const isHint = (message) =>
  Boolean(message) && (message.startsWith("Bitte") || message.endsWith("..."));

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

const LandParcelWizard = ({
  open,
  onClose,
  showLogs = false,
  skipValidation = false,
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [, setUrlParams] = useSearchParams();
  const jwt = useSelector((state) => state.auth.jwt);
  const accountName = useSelector(getLogin);
  const currentKeyString = useSelector(getCurrentLParcelNav);
  const { arten } = useStammdaten();

  const [data, setData] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [problem, setProblem] = useState(CHOOSE_ACTION_PROBLEM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState();
  const [error, setError] = useState();
  const [rebeMipaPrompt, setRebeMipaPrompt] = useState();
  const [logsOpen, setLogsOpen] = useState(false);
  useEffect(() => setLoggingEnabled(showLogs), [showLogs]);

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
    if (action !== data.action) {
      setData({ action });
    }
    setProblem(null);
    setStepIndex(1);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const checkLocks = async () => {
    for (const key of keysToCheck(currentStep.id, data)) {
      if (!key?.id) {
        continue;
      }
      const lock = await findLock(key.id, jwt);
      if (lock) {
        setProblem(
          `Ausgewähltes Flurstück ist gesperrt von Benutzer: ${lock.userString}`
        );
        return false;
      }
    }
    return true;
  };

  const handleNext = async () => {
    setBusy(true);
    try {
      if (skipValidation || (await checkLocks())) {
        setProblem(null);
        setStepIndex(stepIndex + 1);
      }
    } catch (e) {
      setProblem(explain("Das Flurstück konnte nicht geprüft werden", e));
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
      if (!skipValidation && !(await checkLocks())) {
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
      setError(e.message || "Die Aktion konnte nicht ausgeführt werden.");
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    // Setting a parcel historic asks about its rights and leases first — but
    // only for a parcel that was city owned, as LagisBroker does.
    if (
      data.action === WIZARD_ACTIONS.HISTORIC &&
      data.historicKey?.warStaedtisch
    ) {
      setBusy(true);
      try {
        // LagisBroker loads the Flurstück before the dialog, so a key without
        // one fails before any date is asked for
        const flurstueck = await fetchFlurstueckBySchluesselId(
          data.historicKey.id,
          jwt
        );
        if (!flurstueck) {
          setError(
            `Zu "${formatKey(data.historicKey)}" existiert kein Flurstück.`
          );
          return;
        }
        const found = await findRebeAndMipa(data.historicKey, jwt);
        if (found.rebe.length || found.mipa.length) {
          setRebeMipaPrompt(found);
          return;
        }
      } catch (e) {
        setError(
          explain("Rechte und Belastungen konnten nicht geprüft werden", e)
        );
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
      case STEP.ADMIN_AREAS:
        return <AdminAreasStep {...props} />;
      case STEP.USAGE:
        return <UsageStep {...props} />;
      default:
        return null;
    }
  };

  const canAdvance = Boolean(data.action) && (skipValidation || !problem);

  const footer = (
    <WizardFooter
      result={result}
      busy={busy}
      stepIndex={stepIndex}
      stepCount={steps.length}
      showStepCount={!result && Boolean(data.action)}
      isLast={isLast}
      canAdvance={canAdvance}
      onSwitchToResult={
        result?.keys?.[0]?.gemarkung ? switchToResult : undefined
      }
      onClose={handleClose}
      onBack={() => {
        setStepIndex(stepIndex - 1);
        setProblem(null);
      }}
      onNext={handleNext}
      onFinish={handleFinish}
    />
  );

  const header = (
    <WizardHeader
      subtitle={
        data.action
          ? ACTION_TITLES[data.action].replace(/\.\.\.$/, "")
          : "Aktion wählen"
      }
      showLogsToggle={showLogs}
      logsOpen={logsOpen}
      onLogsChange={setLogsOpen}
    />
  );

  const logsVisible = showLogs && logsOpen;

  return (
    <>
      <WizardModal
        open={open}
        header={header}
        footer={footer}
        onCancel={handleClose}
        steps={steps}
        stepIndex={stepIndex}
        stepTitle={result ? null : currentStep.title}
        showLogs={showLogs}
        logsVisible={logsVisible}
        result={result}
        error={error}
        problem={result || stepIndex === 0 ? null : problem}
        problemTone={isHint(problem) ? "info" : "error"}
      >
        {renderStep()}
      </WizardModal>

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
