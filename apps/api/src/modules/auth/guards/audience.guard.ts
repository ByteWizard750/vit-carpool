import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, VerificationStatus } from '@vit-carpool/db';

@Injectable()
export class AudienceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException('User session required.');
    }

    if (user.verificationStatus !== VerificationStatus.VERIFIED || !user.audience) {
      throw new ForbiddenException({
        error: 'AUDIENCE_UNVERIFIED',
        message: 'Verified campus audience membership required.',
      });
    }

    // Attach verified audience to request for scoping downstream queries
    request.audience = user.audience;
    return true;
  }
}
