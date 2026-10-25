import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, VerificationStatus } from '@vit-carpool/db';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException({
        error: 'UNAUTHENTICATED',
        message: 'Authentication required before verification status can be evaluated.',
      });
    }

    if (user.verificationStatus === VerificationStatus.VERIFIED) {
      return true;
    }

    if (user.verificationStatus === VerificationStatus.SUSPENDED) {
      throw new ForbiddenException({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Carpooling access is locked.',
      });
    }

    if (user.verificationStatus === VerificationStatus.REJECTED) {
      throw new ForbiddenException({
        error: 'ACCOUNT_REJECTED',
        message: 'Your institutional verification request was rejected.',
      });
    }

    // Default: PENDING
    throw new ForbiddenException({
      error: 'ACCOUNT_PENDING_VERIFICATION',
      message: 'Account is pending institutional verification. Submit ID proof to unlock carpooling.',
    });
  }
}
