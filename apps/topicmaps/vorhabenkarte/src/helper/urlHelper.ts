export function addTitleFlag() {
  const raw = window.location.hash.slice(1);
  const [path, qs = ""] = raw.split("?", 2);
  const tokens = qs ? qs.split("&") : [];
  if (!tokens.includes("title")) {
    tokens.push("title");
    const newHash = path + (tokens.length ? `?${tokens.join("&")}` : "");
    window.location.hash = newHash;
  }
}
