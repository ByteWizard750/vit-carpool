import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '@vit-carpool/contracts';

export const PERMISSIONS_KEY = 'admin_permissions';
export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

