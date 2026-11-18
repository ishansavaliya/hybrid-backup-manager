import { z } from "zod";
export const scheduleSchema = z
  .object({
    kind: z.enum(["manual", "hourly", "daily", "weekly"]),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((s) => !["daily", "weekly"].includes(s.kind) || !!s.time, {
    message: "Choose a time",
    path: ["time"],
  })
  .refine((s) => s.kind !== "weekly" || (s.days?.length ?? 0) > 0, {
    message: "Choose at least one day",
    path: ["days"],
  });
export const retentionSchema = z
  .object({
    enabled: z.boolean(),
    daily: z.number().int().min(0).max(365),
    weekly: z.number().int().min(0).max(104),
    monthly: z.number().int().min(0).max(120),
  })
  .refine((r) => !r.enabled || r.daily + r.weekly + r.monthly > 0, {
    message: "Keep at least one backup",
    path: ["daily"],
  });
export const defaultSchedule = { kind: "manual" as const };
export const defaultRetention = {
  enabled: false,
  daily: 7,
  weekly: 4,
  monthly: 12,
};
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
        passwordFile: z.string().default(""),
      }),
    )
    .min(1)
    .max(16),
  schedule: scheduleSchema.default(defaultSchedule),
  retention: retentionSchema.default(defaultRetention),
  encrypted: z.boolean().default(false),
});
