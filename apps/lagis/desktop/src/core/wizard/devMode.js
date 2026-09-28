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
