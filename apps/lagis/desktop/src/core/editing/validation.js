import { ActionNotSuccessfulError } from "../wizard/errors";

export const touchedRows = (originalRows, draftRows, idOf) => {
  const before = new Map((originalRows ?? []).map((row) => [idOf(row), row]));
  return (draftRows ?? []).filter((row) => {
    const original = idOf(row) && before.get(idOf(row));
    return !original || JSON.stringify(original) !== JSON.stringify(row);
  });
};

const blank = (value) => !String(value ?? "").trim();
const negative = (value) => Number.isFinite(value) && value < 0;

const missingText = (labels) =>
  `Es ${labels.length === 1 ? "fehlt" : "fehlen"}: ${labels.join(", ")}`;

const tableRules = ({ rows, idOf, nameOf, required, other = [] }) => {
  const invalidFields = (row) =>
    new Set(
      [...required, ...other]
        .filter(([field, , fails]) => field && fails(row))
        .map(([field]) => field)
    );

  const issues = (row) => {
    const missing = required
      .filter(([, , fails]) => fails(row))
      .map(([, label]) => label);
    return [
      ...(missing.length ? [missingText(missing)] : []),
      ...other.filter(([, , fails]) => fails(row)).map(([, text]) => text),
    ];
  };

  // [{ name, text }] for every touched row with problems
  const findProblems = (original, draft) =>
    touchedRows(original?.[rows], draft?.[rows], idOf)
      .map((row) => ({ name: nameOf(row), issues: issues(row) }))
      .filter((problem) => problem.issues.length)
      .map(({ name, issues }) => ({ name, text: issues.join("; ") }));

  return {
    rows,
    idOf,
    required: required.map(([field]) => field),
    invalidFields,
    findProblems,
  };
};

export const USAGE_RULES = tableRules({
  rows: "nutzungen",
  idOf: (row) => row.nutzungId,
  nameOf: (row) => (row.nutzungId ? `Nutzung ${row.nutzungId}` : "Neue Zeile"),
  required: [["nutzungsartId", "Nutzungsart", (row) => !row.nutzungsartId]],
  other: [
    ["flaeche", "Die Fläche ist negativ", (row) => negative(row.flaeche)],
    [
      "quadratmeterpreis",
      "Der m²-Preis ist negativ",
      (row) => negative(row.quadratmeterpreis),
    ],
  ],
});

export const findUsageProblems = (original, draft) => {
  const problems = USAGE_RULES.findProblems(original, draft);
  const changed =
    draft?.nutzungen?.length !== original?.nutzungen?.length ||
    touchedRows(original?.nutzungen, draft?.nutzungen, USAGE_RULES.idOf)
      .length > 0;
  if (changed && !draft.nutzungen.some((row) => row.nutzungsartId)) {
    problems.push({
      text: "Es muss mindestens eine aktuelle Nutzung mit Nutzungsart angelegt sein.",
    });
  }
  return problems;
};

export const findAdminProblems = (admin) => {
  const tableProblems = (name, rows, fields, extra = []) => {
    const missing = fields
      .filter(([field]) => rows.some((row) => blank(row[field])))
      .map(([, label]) => label);
    const texts = [
      ...(missing.length ? [missingText(missing)] : []),
      ...extra.filter(([fails]) => fails).map(([, text]) => text),
    ];
    return texts.length ? [{ name, text: texts.join("; ") }] : [];
  };
  const duplicates = (values) => new Set(values).size !== values.length;
  const { dienststellen = [], rollen = [], strassenfronten = [] } = admin;
  return [
    ...tableProblems(
      "Dienststellen",
      dienststellen,
      [["dienststelleId", "Dienststelle"]],
      [
        [
          duplicates(dienststellen.map((row) => row.dienststelleId)),
          "Eine Dienststelle ist mehrfach eingetragen",
        ],
        [admin.pieces?.length > 0, "Es gibt noch nicht zugeordnete Flächen"],
      ]
    ),
    ...tableProblems(
      "Zusätzliche Rollen",
      rollen,
      [
        ["dienststelleId", "Dienststelle"],
        ["rolleArtId", "Rolle"],
      ],
      [
        [
          duplicates(rollen.map((r) => `${r.dienststelleId}/${r.rolleArtId}`)),
          "Eine Rolle ist mehrfach eingetragen",
        ],
      ]
    ),
    ...tableProblems("Straßenfronten", strassenfronten, [
      ["strassenname", "Straße"],
    ]),
  ];
};

export const MIPA_RULES = tableRules({
  rows: "mipas",
  idOf: (row) => row.mipaId,
  nameOf: (row) =>
    [row.lage, row.aktenzeichen].filter((v) => !blank(v)).join(", ") ||
    (row.mipaId ? `Nr. ${row.mipaId}` : "Neue Zeile"),
  required: [
    ["lage", "Lage", (row) => blank(row.lage)],
    ["aktenzeichen", "Aktenzeichen", (row) => blank(row.aktenzeichen)],
    ["kategorieId", "Nutzung", (row) => !row.kategorieId],
    ["nutzer", "Nutzer", (row) => blank(row.nutzer)],
    ["vertragsbeginn", "Vertragsbeginn", (row) => !row.vertragsbeginn],
  ],
  other: [
    [
      "vertragsende",
      "Das Vertragsende liegt vor dem Vertragsbeginn",
      (row) =>
        row.vertragsbeginn &&
        row.vertragsende &&
        row.vertragsbeginn > row.vertragsende,
    ],
    [undefined, "Die Geometrie fehlt", (row) => !row.geometry],
  ],
});

export const REBE_RULES = tableRules({
  rows: "rebes",
  idOf: (row) => row.rebeId,
  nameOf: (row) => {
    const kind = row.istRecht ? "Recht" : "Belastung";
    if (!blank(row.nummer)) {
      return `${kind} ${row.nummer.trim()}`;
    }
    return row.rebeId ? `${kind} Nr. ${row.rebeId}` : `${kind} (neu)`;
  },
  required: [],
  other: [
    [
      "loeschung",
      "Die Löschung liegt vor der Eintragung",
      (row) =>
        row.eintragung && row.loeschung && row.eintragung > row.loeschung,
    ],
    [undefined, "Die Geometrie fehlt", (row) => !row.geometry],
  ],
});

// a failed check before saving; sections: [{ title, items: [{ name?, text }] }]
export class DraftValidationError extends ActionNotSuccessfulError {
  constructor(sections) {
    super(
      sections
        .map(({ title, items }) =>
          [
            title,
            ...items.map(({ name, text }) =>
              name ? `• ${name}: ${text}` : `• ${text}`
            ),
          ].join("\n")
        )
        .join("\n\n")
    );
    this.name = "DraftValidationError";
    this.sections = sections;
  }
}
