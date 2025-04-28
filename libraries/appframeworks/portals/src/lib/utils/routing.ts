type EncodedSceneParams = {
  hashParams: Record<string, string>;
  state?: unknown;
};

export const getHashParams = (
  hash = window.location.hash.split("?")[1] || ""
) => {
  const params = Object.fromEntries(new URLSearchParams(hash));
  return params;
};

export const replaceHashRoutedHistory = (
  { hashParams }: EncodedSceneParams,
  routedPath: string,
  label: string = "N/A" // for tracing debugging only
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  if (hashParams) {
    const currentParams = getHashParams();
    const combinedParams: Record<string, string> = {
      ...currentParams,
      ...hashParams, // overwrite from state but keep others
    };

    // remove empty values
    // be aware this disables "boolean" keys without a value
    Object.entries(combinedParams).forEach(([key, value]) => {
      if (value.trim() === "") {
        delete combinedParams[key];
      }
    });

    const combinedSearchParams = new URLSearchParams(combinedParams);
    const combinedHash = combinedSearchParams.toString();
    //const formattedHash = combinedHash.replace(/=&/g, "&").replace(/=$/, ""); // remove empty values
    const fullHashState = `#${routedPath}?${combinedHash}`;
    // this is a workaround to avoid triggering rerenders from the HashRouter
    // navigate would cause rerenders
    // navigate(`${routedPath}?${formattedHash}`, { replace: true });
    // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

    const currentUrl = new URL(window.location.href);
    const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

    window.history.replaceState(null, "", newUrl);
  }
};
