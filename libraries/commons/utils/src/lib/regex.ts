export const isHtmlString = (str: string): boolean => {
  return typeof str === "string" && /<[^>]+>/.test(str);
};
