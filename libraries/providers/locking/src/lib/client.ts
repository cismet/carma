import UAParser from "ua-parser-js";

export const clientName = () => new UAParser().getBrowser().name ?? "Browser";
