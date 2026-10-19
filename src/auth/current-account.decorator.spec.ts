import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { getCurrentAccountId } from './current-account.decorator.js';

const accountId = '11111111-1111-4111-8111-111111111111';

function contextWithHeaders(headers: Record<string, string | string[]>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('getCurrentAccountId', () => {
  it('returns the account id from the x-account-id header', () => {
    const ctx = contextWithHeaders({ 'x-account-id': accountId });

    expect(getCurrentAccountId(undefined, ctx)).toBe(accountId);
  });

  it.each([
    ['missing', {}],
    ['not a uuid', { 'x-account-id': 'abc' }],
    ['sent twice', { 'x-account-id': [accountId, accountId] }],
  ])('rejects a header that is %s', (_, headers) => {
    const ctx = contextWithHeaders(headers);

    expect(() => getCurrentAccountId(undefined, ctx)).toThrow(
      UnauthorizedException,
    );
  });
});
