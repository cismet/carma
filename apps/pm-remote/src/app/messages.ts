import { RelayError, ShowStoreError } from "@carma-mapping/show-remote";

/** the relay's failures as the presenter reads them */
export const relayErrorText = (error: unknown): string => {
  if (error instanceof RelayError) {
    switch (error.status) {
      case undefined:
        return "Das Relay ist nicht erreichbar.";
      case 404:
        return "Das Relay kennt diesen Sitzungscode nicht.";
      case 429:
        return "Zu viele unbekannte Codes: Das Relay sperrt dieses Gerät für eine Minute.";
      case 413:
        return "Die Szene ist zu groß für das Relay.";
      default:
        return `Das Relay antwortet mit HTTP ${error.status}.`;
    }
  }
  return error instanceof Error ? error.message : String(error);
};

/** failures reading a show from the store */
export const showErrorText = (error: unknown): string => {
  if (error instanceof ShowStoreError) {
    switch (error.status) {
      case undefined:
        return "Unter diesem Schlüssel liegt keine Show.";
      case 404:
        return "Unter diesem Schlüssel ist nichts gespeichert.";
      default:
        return `Der Show-Speicher antwortet mit HTTP ${error.status}.`;
    }
  }
  if (error instanceof TypeError) {
    return "Der Show-Speicher ist nicht erreichbar.";
  }
  return error instanceof Error ? error.message : String(error);
};
