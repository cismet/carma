import { v4 as uuidV4 } from "uuid";

/** A random RFC 4122 uuid identifying an annotation across sets and devices. */
export const createAnnotationUuid = (): string => uuidV4();
