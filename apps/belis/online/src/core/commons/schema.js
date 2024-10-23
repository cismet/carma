export const actionSchema = {
  title: "action schema",
  description: "action schema",
  version: 0,
  primaryKey: 'id',
  type: "object",
  properties: {
    id: {
      type: "string",
      primary: true,
      maxLength: 100
    },
    jwt: {
      type: "string",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      index: true,
    },
    updatedAt: {
      type: "string",
      format: "date-time",
    },
    applicationId: {
      type: "string",
    },
    isCompleted: {
      type: "boolean",
    },
    action: {
      type: "string",
    },
    parameter: {
      type: "string",
    },
    result: {
      type: "string",
    },
    body: {
      type: "string",
    },
    status: {
      type: "integer",
    },
  },
  required: ["isCompleted", "jwt", "createdAt", "updatedAt", "action"],
  additionalProperties: true,
};
