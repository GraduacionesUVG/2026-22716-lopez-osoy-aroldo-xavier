import { z } from 'zod';

export const consentPdfGenerateRequestedSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    eventType: z.literal('consent.pdf.generate.requested'),
    jobId: z.string().uuid(),
    requestedAt: z.string().datetime(),
    consentimiento_id: z.string().uuid(),
    ficha_id: z.string().uuid(),
  })
  .strict();

export type ConsentPdfGenerateRequestedEvent = z.infer<typeof consentPdfGenerateRequestedSchema>;
