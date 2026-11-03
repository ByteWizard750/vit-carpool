import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '@vit-carpool/db';
import { AdminPermission, hasAdminPermission } from '@vit-carpool/contracts';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException({
        error: 'ADMIN_PRIVILEGES_REQUIRED',
        message: 'This operation requires an authenticated administrative account.',
      });
    }

    const adminRoles: UserRole[] = [
      UserRole.MODERATOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ];

    if (!adminRoles.includes(user.role)) {
      throw new ForbiddenException({
        error: 'ADMIN_PRIVILEGES_REQUIRED',
        message: 'This operation requires an authorized administrative account.',
      });
    }

    if (user.isSuspended || user.verificationStatus === 'SUSPENDED') {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your administrative account has been suspended.',
      });
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const missingPermissions = requiredPermissions.filter(
      (perm) => !hasAdminPermission(user.role, perm),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        error: 'INSUFFICIENT_ADMIN_PERMISSIONS',
        message: `Your administrative role (${user.role}) lacks the required permission(s): ${missingPermissions.join(', ')}.`,
      });
    }

    return true;
  }
}

