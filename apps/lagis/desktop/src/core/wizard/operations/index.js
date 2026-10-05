import { ACTION_TITLES, WIZARD_ACTIONS } from "../constants";
import { ActionNotSuccessfulError } from "../api";
import { createJournal, describeRollbackFailures } from "../../editing/journal";
import { createFlurstueck } from "./create";
import { renameFlurstueck } from "./rename";
import { setFlurstueckHistoric } from "./historic";
import { activateFlurstueck } from "./activate";
import { changeFlurstueckArt } from "./changeKind";
import { splitFlurstuecke } from "./split";
import { joinFlurstuecke } from "./join";
import { joinSplitFlurstuecke } from "./joinSplit";
import { saveAdminData } from "./admin";
import { saveUsageData } from "./usage";
import { createProgress } from "../progress";

const HANDLERS = {
  [WIZARD_ACTIONS.CREATE]: createFlurstueck,
  [WIZARD_ACTIONS.RENAME]: renameFlurstueck,
  [WIZARD_ACTIONS.HISTORIC]: setFlurstueckHistoric,
  [WIZARD_ACTIONS.ACTIVATE]: activateFlurstueck,
  [WIZARD_ACTIONS.CHANGE_KIND]: changeFlurstueckArt,
  [WIZARD_ACTIONS.SPLIT]: splitFlurstuecke,
  [WIZARD_ACTIONS.JOIN]: joinFlurstuecke,
  [WIZARD_ACTIONS.SPLIT_JOIN]: joinSplitFlurstuecke,
};

// estimates until the action returns the real keys
const countEntries = (byLabel) =>
  Object.values(byLabel ?? {}).filter((entry) =>
    Array.isArray(entry) ? entry.length : Boolean(entry)
  ).length;

export const runWizardAction = async (
  action,
  payload,
  { onProgress, ...context }
) => {
  const handler = HANDLERS[action];
  if (!handler) {
    throw new ActionNotSuccessfulError(`Unbekannte Aktion: ${action}`);
  }

  const journal = createJournal();
  const progress = createProgress(
    [
      { id: "action", title: ACTION_TITLES[action].replace(/\.\.\.$/, "") },
      {
        id: "admin",
        title: "Verwaltungsdaten speichern",
        total: countEntries(payload.admin),
      },
      {
        id: "usage",
        title: "Nutzungen speichern",
        total: countEntries(payload.usage),
      },
    ],
    onProgress
  );
  const ctx = { ...context, journal, progress };

  try {
    progress.start("action");
    const result = await handler(payload, ctx);
    progress.finish("action");
    await saveAdminData(result.keys ?? [], payload.admin, ctx);
    await saveUsageData(result.keys ?? [], payload.usage, ctx);
    journal.commit();
    return result;
  } catch (error) {
    console.error(`[wizard] ${action} failed`, error);
    progress.fail();
    const failed = await journal.rollback();
    progress.rolledBack();
    const reason =
      error instanceof ActionNotSuccessfulError
        ? error.message
        : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
    const enriched = new ActionNotSuccessfulError(
      [reason, describeRollbackFailures(failed)].filter(Boolean).join("\n\n"),
      error
    );
    enriched.rollbackFailures = failed;
    throw enriched;
  } finally {
    progress.dispose();
  }
};

export {
  createFlurstueck,
  renameFlurstueck,
  setFlurstueckHistoric,
  activateFlurstueck,
  changeFlurstueckArt,
  splitFlurstuecke,
  joinFlurstuecke,
  joinSplitFlurstuecke,
};
