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

    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        error: 'ADMIN_PRIVILEGES_REQUIRED',
        message: 'This administrative operation requires an authorized ADMIN account.',
      });
    }

    return true;
  }
}
