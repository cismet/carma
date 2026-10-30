declare module "ua-parser-js" {
  export default class UAParser {
    getBrowser(): { name?: string; version?: string };
  }
}
