/**
 * Whether to show the raw GraphQL panel.
 *
 * Same rule the BelIS Arbeitsauftrag search uses: an explicit `showRaw` in the
 * URL wins, otherwise it is on for localhost only. lagis-desktop routes on the
 * hash, so the parameter is looked for there first.
 */
export const isRawVisible = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const fromHash = new URLSearchParams(
    window.location.hash.split("?")[1] ?? ""
  ).get("showRaw");
  const fromSearch = new URLSearchParams(window.location.search).get("showRaw");
  const param = fromHash ?? fromSearch;
  if (param !== null) {
    return param === "true";
  }
  return window.location.hostname === "localhost";
};
