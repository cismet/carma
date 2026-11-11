// the app uses a hash router, so params may sit in the hash or the search part
const urlParam = (name) => {
  if (typeof window === "undefined") {
    return null;
  }
  const fromHash = new URLSearchParams(
    window.location.hash.split("?")[1] ?? ""
  ).get(name);
  return fromHash ?? new URLSearchParams(window.location.search).get(name);
};

export const isRawVisible = () => {
  const param = urlParam("showRaw");
  if (param !== null) {
    return param === "true";
  }
  return (
    typeof window !== "undefined" && window.location.hostname === "localhost"
  );
};

// ?wizardTestMode=true: the wizard starts from TEST_WIZARD_DATA, skips all
// checks and never saves
export const isWizardTestMode = () => urlParam("wizardTestMode") === "true";
