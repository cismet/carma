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

/** A short, readable rendering of whatever the server sent back. */
const describeDetail = (detail) => {
  if (detail === undefined || detail === null) {
    return undefined;
  }
  const text =
    typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
  if (!text || text === "{}") {
    return undefined;
  }
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
};

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
    // keep the stack reachable — the panel shows the payload, not the trace
    console.error(`[wizard] ${action} failed`, error);
    const failed = await journal.rollback();
    const reason =
      error instanceof ActionNotSuccessfulError
        ? error.message
        : `Unbekannter Fehler: ${error?.message ?? error}. ` +
          "Bitte wenden Sie sich an Ihren Systemadministrator.";
    // the server's own words, when it gave any
    const detail = describeDetail(error?.detail);
    const enriched = new ActionNotSuccessfulError(
      [reason, detail, describeRollbackFailures(failed)]
        .filter(Boolean)
        .join("\n\n"),
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
