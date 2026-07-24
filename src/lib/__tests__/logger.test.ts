import { describe, expect, it } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  it('exports a pino instance silenced under NODE_ENV=test', () => {
    expect(logger.level).toBe('silent');
  });

  it('supports the standard structured log methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
