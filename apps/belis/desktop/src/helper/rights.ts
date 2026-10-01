import { CONFIG_ATTRIBUTES_URL } from "../constants/belis";

export interface BelisRights {
  createBasic: boolean;
  createAA: boolean;
  editBasic: boolean;
  editAA: boolean;
  editKeytables: boolean;
  delete: boolean;
}

const ATTRIBUTES = [
  "belis.create.Basic",
  "belis.create.Arbeitsauftrag",
  "belis.create.Veranlassung",
  "belis.edit.Basic",
  "belis.edit.Arbeitsauftrag",
  "belis.edit.Veranlassung",
  "belis.edit.Keytables",
  "belis.delete",
] as const;

type Attribute = (typeof ATTRIBUTES)[number];

// 200 with a value = granted, 404 = not granted, anything else = unknown (throws).
const hasAttribute = async (jwt: string, name: Attribute) => {
  const response = await fetch(CONFIG_ATTRIBUTES_URL + name, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`configattribute ${name}: HTTP ${response.status}`);
  }
  const body = await response.json();
  // Key may or may not carry a "@DOMAIN" suffix.
  return Object.values(body ?? {}).some(
    (v) => typeof v === "string" && v.trim().length > 0
  );
};

// Returns null if the rights could not be determined.
export const fetchBelisRights = async (
  jwt: string
): Promise<BelisRights | null> => {
  try {
    const values = await Promise.all(
      ATTRIBUTES.map((name) => hasAttribute(jwt, name))
    );
    const has = Object.fromEntries(
      ATTRIBUTES.map((name, i) => [name, values[i]])
    ) as Record<Attribute, boolean>;

    // Veranlassung is treated as part of Arbeitsauftrag.
    return {
      createBasic: has["belis.create.Basic"],
      createAA:
        has["belis.create.Arbeitsauftrag"] || has["belis.create.Veranlassung"],
      editBasic: has["belis.edit.Basic"],
      editAA:
        has["belis.edit.Arbeitsauftrag"] || has["belis.edit.Veranlassung"],
      editKeytables: has["belis.edit.Keytables"],
      delete: has["belis.delete"],
    };
  } catch (error) {
    console.warn("Could not load BelIS rights, using fallback.", error);
    return null;
  }
};
