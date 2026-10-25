import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@vit-carpool/db';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as User | undefined;
    return data && user ? user[data] : user;
  },
);
