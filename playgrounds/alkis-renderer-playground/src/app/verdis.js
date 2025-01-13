import { gql } from "graphql-request";
import queries from "./queries";

export const alkisLandParcelQuery = gql`
  ${queries.alkisLandparcel}
`;
