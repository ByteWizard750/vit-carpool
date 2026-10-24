import { z } from 'zod';

export const AudienceTypeSchema = z.enum(['STUDENT', 'FACULTY']);
export type AudienceType = z.infer<typeof AudienceTypeSchema>;

export const VerificationStatusSchema = z.enum([
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;
