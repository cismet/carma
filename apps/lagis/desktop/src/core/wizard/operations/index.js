import { WIZARD_ACTIONS } from "../constants";
import { ActionNotSuccessfulError } from "../api";
import { createJournal, describeRollbackFailures } from "../journal";
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

export const runWizardAction = async (action, payload, context) => {
  const handler = HANDLERS[action];
  if (!handler) {
    throw new ActionNotSuccessfulError(`Unbekannte Aktion: ${action}`);
  }

  const journal = createJournal();
  const ctx = { ...context, journal };

  try {
    const result = await handler(payload, ctx);
    await saveAdminData(result.keys ?? [], payload.admin, ctx);
    await saveUsageData(result.keys ?? [], payload.usage, ctx);
    journal.commit();
    return result;
  } catch (error) {
    console.error(`[wizard] ${action} failed`, error);
    const failed = await journal.rollback();
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
