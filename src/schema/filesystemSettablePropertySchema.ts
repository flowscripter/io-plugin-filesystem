import { z } from "zod";

/** The provider-specific entry properties accepted by `setProperties`. */
export const filesystemSettablePropertySchema = z.object({ mode: z.number().optional() });
