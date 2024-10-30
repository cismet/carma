type EncodedSceneParams = {
  hashParams: Record<string, string>;
  state: unknown;
};

export const replaceHashRoutedHistory = (
  encodedScene: EncodedSceneParams,
  routedPath: string
) => {
  // this is method is used to avoid triggering rerenders from the HashRouter when updating the hash
  if (encodedScene.hashParams) {
    const currentHash = window.location.hash.split("?")[1] || "";
    const currentParams = Object.fromEntries(new URLSearchParams(currentHash));

    const combinedParams = {
      ...currentParams,
      ...encodedScene.hashParams, // overwrite from state but keep others
    };

    const combinedSearchParams = new URLSearchParams(combinedParams);
    const combinedHash = combinedSearchParams.toString();
    const formattedHash = combinedHash.replace(/=&/g, "&").replace(/=$/, ""); // remove empty values
    const fullHashState = `#${routedPath}?${formattedHash}`;
    // this is a workaround to avoid triggering rerenders from the HashRouter
    // navigate would cause rerenders
    // navigate(`${routedPath}?${formattedHash}`, { replace: true });
    // see https://github.com/remix-run/react-router/discussions/9851#discussioncomment-9459061

    const currentUrl = new URL(window.location.href);
    const newUrl = `${currentUrl.origin}${currentUrl.pathname}${fullHashState}`;

    window.history.replaceState(null, "", newUrl);
  }
};
