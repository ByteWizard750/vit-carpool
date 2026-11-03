import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, UserRole } from '@vit-carpool/db';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    const adminRoles: UserRole[] = [
      UserRole.MODERATOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ];

    if (!user || !adminRoles.includes(user.role)) {
      throw new ForbiddenException({
        error: 'ADMIN_PRIVILEGES_REQUIRED',
        message: 'This administrative operation requires an authorized staff account.',
      });
    }

    if (user.isSuspended || user.verificationStatus === 'SUSPENDED') {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your administrative account has been suspended.',
      });
    }

    return true;
  }
}
