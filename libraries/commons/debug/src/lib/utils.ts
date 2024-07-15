export const removeParamFromString = (str: string, param: string): string => {
  // Create a regex that matches the param with optional value and the following '&' if it exists
  const paramRegex = new RegExp(`[?&]${param}(=[^&]*)?(&)?`, 'g');

  return str.replace(paramRegex, '');
};

export const hasHashParam = (param: string): boolean => {
  const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
  return hashParams.has(param);
};

export const removeHashParam = (param: string) => {
  const hash = window.location.hash;
  const newHash = removeParamFromString(hash, param);
  if (newHash !== hash) {
    window.history.replaceState(null, '', newHash);
  }
};
