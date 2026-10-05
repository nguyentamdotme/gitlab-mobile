import { z } from 'zod';
export const eventRouteSchema = z.object({
  instance: z.string().url(), userId: z.number().int().positive(), projectId: z.number().int().positive(),
  resource: z.enum(['pipelines', 'jobs', 'merge-requests', 'issues', 'environments', 'deployments']),
  id: z.number().int().positive(),
});
export type EventRoute = z.infer<typeof eventRouteSchema>;
export const pushDataSchema = z.object({ eventId: z.string().uuid(), accountRef: z.string().uuid() });
export const serviceSessionSchema = z.object({
  accessToken: z.string(), refreshToken: z.string(), expiresAt: z.number(),
  accountRef: z.string().uuid(), cleanupToken: z.string().optional(),
});
export type ServiceSession = z.infer<typeof serviceSessionSchema>;
export const quietHoursSchema = z.object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(0).max(1439) }).nullable();
export const subscriptionPreferencesSchema = z.object({
  events: z.array(z.enum(['pipelines', 'jobs', 'merge-requests', 'issues', 'environments', 'deployments'])).min(1),
  quietHours: quietHoursSchema,
});
