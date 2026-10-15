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
  "belis.edit.Basic",
  "belis.edit.Arbeitsauftrag",
  "belis.edit.Keytables",
  "belis.delete",
] as const;

type Attribute = (typeof ATTRIBUTES)[number];

// Only 200 with a value = granted; any error counts as not granted.
const hasAttribute = async (jwt: string, name: Attribute) => {
  try {
    const response = await fetch(CONFIG_ATTRIBUTES_URL + name, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (response.status !== 200) return false;
    const body = await response.json();
    // Key may or may not carry a "@DOMAIN" suffix.
    return Object.values(body ?? {}).some(
      (v) => typeof v === "string" && v.trim().length > 0
    );
  } catch (error) {
    console.warn(`Could not load BelIS right ${name}.`, error);
    return false;
  }
};

export const fetchBelisRights = async (jwt: string): Promise<BelisRights> => {
  const values = await Promise.all(
    ATTRIBUTES.map((name) => hasAttribute(jwt, name))
  );
  const has = Object.fromEntries(
    ATTRIBUTES.map((name, i) => [name, values[i]])
  ) as Record<Attribute, boolean>;

  return {
    createBasic: has["belis.create.Basic"],
    createAA: has["belis.create.Arbeitsauftrag"],
    editBasic: has["belis.edit.Basic"],
    editAA: has["belis.edit.Arbeitsauftrag"],
    editKeytables: has["belis.edit.Keytables"],
    delete: has["belis.delete"],
  };
};
