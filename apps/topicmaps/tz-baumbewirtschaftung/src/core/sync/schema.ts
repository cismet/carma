export interface ActionDocument {
  id: string;
  jwt: string;
  createdAt: string;
  updatedAt: string;
  applicationId: string;
  isCompleted: boolean;
  action: string;
  parameter: string;
  result?: string;
  status?: number;
}

export interface ActionDocumentWithDeleted extends ActionDocument {
  _deleted: boolean;
}

export const actionSchema = {
  title: "action schema",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    jwt: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    applicationId: { type: "string" },
    isCompleted: { type: "boolean" },
    action: { type: "string" },
    parameter: { type: "string" },
    result: { type: "string" },
    status: { type: "integer" },
  },
  required: ["id", "isCompleted", "jwt", "createdAt", "updatedAt", "action"],
  indexes: ["createdAt"],
} as const;
