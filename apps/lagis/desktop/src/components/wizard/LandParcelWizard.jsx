import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Space, Steps, Tooltip } from "antd";
import { CodeOutlined, InfoCircleOutlined } from "@ant-design/icons";
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
import GraphQLPanel from "./GraphQLPanel";

import { STEP, getSteps } from "../../core/wizard/flow";
import { ACTION_TITLES, WIZARD_ACTIONS } from "../../core/wizard/constants";
import { findLock } from "../../core/wizard/locks";
import { findRebeAndMipa } from "../../core/wizard/areaCheck";
import { runWizardAction } from "../../core/wizard/operations";
import useStammdaten from "../../core/wizard/useStammdaten";
import { setLoggingEnabled } from "../../core/wizard/gqlLog";

import { getLogin } from "../../store/slices/auth";
import { getflurstuecke } from "../../store/slices/landParcels";
import { getCurrentLParcelNav } from "../../store/slices/lpHistoryNav";
import { removeLeadingZeros } from "../../core/tools/helper";

const CHOOSE_ACTION_PROBLEM = "Bitte wählen Sie eine der obigen Aktionen aus";

const PANE_STYLE = { height: "min(62vh, 520px)", minHeight: 380 };

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
  const currentKeyString = useSelector(getCurrentLParcelNav);
  const { arten } = useStammdaten();

  const [data, setData] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [problem, setProblem] = useState(CHOOSE_ACTION_PROBLEM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState();
  const [error, setError] = useState();
  const [rebeMipaPrompt, setRebeMipaPrompt] = useState();
  const showRaw = showGraphQL === true;
  const [rawOpen, setRawOpen] = useState(false);

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
        const found = await findRebeAndMipa(data.historicKey, jwt);
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
      case STEP.ADMIN_AREAS:
        return <AdminAreasStep {...props} />;
      case STEP.USAGE:
        return <UsageStep {...props} />;
      default:
        return null;
    }
  };

  const footerButtons = result
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

  const header = (
    <div
      className="flex items-start justify-between gap-4"
      style={{ paddingRight: 32 }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
          Flurstück Assistent
        </div>
        <div
          className="text-gray-500"
          style={{ fontSize: 12, fontWeight: 400 }}
        >
          {data.action
            ? ACTION_TITLES[data.action].replace(/\.\.\.$/, "")
            : "Aktion wählen"}
        </div>
      </div>
      {showRaw && (
        <Tooltip title={rawOpen ? "Assistent anzeigen" : "GraphQL anzeigen"}>
          <Button
            size="small"
            shape="circle"
            type={rawOpen ? "primary" : "text"}
            icon={<CodeOutlined />}
            aria-label="GraphQL"
            onClick={() => setRawOpen(!rawOpen)}
            style={rawOpen ? undefined : { color: "#8c8c8c" }}
          />
        </Tooltip>
      )}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-400" style={{ fontSize: 12 }}>
        {!result && data.action
          ? `Schritt ${stepIndex + 1} von ${steps.length}`
          : ""}
      </span>
      <Space size={8}>{footerButtons}</Space>
    </div>
  );

  const graphQLOpen = showRaw && rawOpen;

  return (
    <>
      <Modal
        open={open}
        title={header}
        width={880}
        centered
        onCancel={handleClose}
        maskClosable={false}
        footer={footer}
        styles={{
          content: { padding: 0, overflow: "hidden" },
          header: {
            padding: "16px 24px",
            marginBottom: 0,
            borderBottom: "1px solid #f0f0f0",
          },
          body: { padding: 0 },
          footer: {
            padding: "12px 24px",
            marginTop: 0,
            borderTop: "1px solid #f0f0f0",
            background: "#fafafa",
          },
        }}
      >
        <div style={PANE_STYLE}>
          {showRaw && (
            <div
              style={{
                display: graphQLOpen ? "block" : "none",
                height: "100%",
                overflow: "hidden",
                padding: "16px 24px",
              }}
            >
              <GraphQLPanel />
            </div>
          )}

          {/* kept mounted rather than unmounted: the choosers hold the typed
              Flurstück in local state, which unmounting would discard */}
          <div
            style={{
              display: graphQLOpen ? "none" : "flex",
              height: "100%",
            }}
          >
            <div
              style={{
                width: 244,
                flex: "0 0 244px",
                background: "#fafafa",
                borderRight: "1px solid #f0f0f0",
                padding: "20px 16px",
                overflowY: "auto",
              }}
            >
              <Steps
                direction="vertical"
                size="small"
                current={stepIndex}
                items={steps.map((step) => ({
                  title: <span style={{ fontSize: 13 }}>{step.title}</span>,
                }))}
              />
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                padding: "20px 24px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                {!result && (
                  <div
                    style={{
                      marginBottom: 16,
                      paddingBottom: 10,
                      borderBottom: "1px solid #f0f0f0",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {currentStep.title}
                  </div>
                )}
                {result ? (
                  <Alert
                    type="success"
                    showIcon
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
                    showIcon
                    message="Die Aktion ist fehlgeschlagen"
                    description={
                      <span style={{ whiteSpace: "pre-line" }}>{error}</span>
                    }
                  />
                )}
              </div>
              {!result && problem && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    marginTop: 16,
                    fontSize: 13,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#f0f7ff",
                    border: "1px solid #d6e4ff",
                    color: "#1d4ed8",
                  }}
                >
                  <InfoCircleOutlined style={{ marginTop: 3 }} />
                  <span>{problem}</span>
                </div>
              )}
            </div>
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
