import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

export function getCurrentAccountId(_: unknown, ctx: ExecutionContext) {
  const id = ctx.switchToHttp().getRequest<Request>().headers['x-account-id'];
  if (typeof id !== 'string' || !isUUID(id)) {
    throw new UnauthorizedException('Missing or invalid x-account-id header');
  }
  return id;
}

export const CurrentAccountId = createParamDecorator(getCurrentAccountId);
