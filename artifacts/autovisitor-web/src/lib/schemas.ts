import { z } from "zod";
import { SessionInputMode } from "@workspace/api-client-react";

export const sessionFormSchema = z.object({
  token: z.string().min(1, "API Token is required"),
  url: z.string().url("Must be a valid URL"),
  count: z.coerce.number().min(1).max(1000).default(20),
  delay: z.coerce.number().min(0).default(1.0),
  mode: z.nativeEnum(SessionInputMode).default("direct"),
});

export type SessionFormValues = z.infer<typeof sessionFormSchema>;
