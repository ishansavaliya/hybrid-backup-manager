import { z } from "zod";
export const planSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(120),
  sources: z.array(z.string().min(1)).min(1).max(32),
  exclusions: z.array(z.string()).default([]),
  destinations: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
        name: z.string().min(1),
        repository: z.string().min(1),
        passwordFile: z.string().min(1),
      }),
    )
    .min(1)
    .max(16),
});
