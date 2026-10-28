import { SetMetadata } from '@nestjs/common';

export const ALLOW_SUSPENDED_KEY = 'allowSuspended';
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);
