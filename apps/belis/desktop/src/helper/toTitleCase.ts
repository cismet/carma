/**
 * Convert ALL CAPS street names to Title Case.
 * Handles spaces and hyphens (e.g. "GROSSE FLURSTR" -> "Grosse Flurstr",
 * "SCHLESWIG-HOLSTEINSTR" -> "Schleswig-Holsteinstr").
 */
const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-")
    )
    .join(" ");
};

export default toTitleCase;
