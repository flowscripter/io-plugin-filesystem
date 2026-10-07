import { z } from "zod";

/** Provider-specific entry properties reported in `EntryProperties.properties`. */
export const filesystemPropertySchema = z.object({ mode: z.number().optional() });
