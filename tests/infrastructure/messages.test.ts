import { describe, expect, it } from 'vitest';
import {
  isExtensionStatus,
  isStatusRequest,
  MESSAGE_TYPES,
} from '../../src/infrastructure/messaging/messages';

describe('runtime message boundaries', () => {
  it('recognizes the centralized status request', () => {
    expect(isStatusRequest({ type: MESSAGE_TYPES.getStatus })).toBe(true);
  });

  it.each([null, undefined, true, 'extension:get-status', {}, { type: 'unknown' }])(
    'ignores unrecognized requests: %j',
    (value) => {
      expect(isStatusRequest(value)).toBe(false);
    },
  );

  it('accepts the manifest version returned by the background worker', () => {
    expect(isExtensionStatus({ version: '0.1.0' })).toBe(true);
  });

  it.each([null, undefined, {}, { version: 1 }, { version: '' }, { version: 'invalid' }])(
    'rejects invalid runtime responses: %j',
    (value) => {
      expect(isExtensionStatus(value)).toBe(false);
    },
  );
});
