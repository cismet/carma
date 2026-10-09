// Lookup ids can be 0 (rebe_art "Denkmalschutz"), so never test them for truthiness.
export const hasId = (id) => id !== undefined && id !== null;
