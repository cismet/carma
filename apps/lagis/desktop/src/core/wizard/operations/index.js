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

/**
 * Runs one wizard action.
 *
 * Every action shares a journal: on failure the writes that already went
 * through are undone in reverse order, which is as close to the cids
 * transaction of the Swing client as the GraphQL API gets. Whether that undo
 * fully succeeded is part of the error the caller receives.
 *
 * @param {string} action   one of WIZARD_ACTIONS
 * @param {Object} payload  action specific, see the individual modules
 * @param {Object} context  { jwt, accountName, currentKeyString }
 */
export const runWizardAction = async (action, payload, context) => {
  const handler = HANDLERS[action];
  if (!handler) {
    throw new ActionNotSuccessfulError(`Unbekannte Aktion: ${action}`);
  }

  const journal = createJournal();
  const ctx = { ...context, journal };

  try {
    const result = await handler(payload, ctx);
    journal.commit();
    return result;
  } catch (error) {
    const failed = await journal.rollback();
    const reason =
      error instanceof ActionNotSuccessfulError
        ? error.message
        : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
    const enriched = new ActionNotSuccessfulError(
      `${reason}\n\n${describeRollbackFailures(failed)}`,
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
