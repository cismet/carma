import { gql } from "graphql-request";
import queries from "./queries";

export const landParcelSearchQuery = gql`
  ${queries.landparcelSearch}
`;

export const sheetSearchQuery = gql`
  ${queries.sheetSearch}
`;
