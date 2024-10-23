interface VersionData {
  version: string;
  triggered?: string | null;
  md5?: string;
}

export const getApplicationVersion = (versionData: VersionData): string => {
  let v = versionData.version;
  if (versionData.triggered === "live") {
    return "v" + v;
  } else if (versionData.triggered && versionData.md5) {
    return `${versionData.triggered} v${v}++ (#${versionData.md5.substring(
      0,
      4,
    )})`;
  } else {
    return `v${v}++ (dev-hot-reload)`;
  }
};
