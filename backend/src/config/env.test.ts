import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const MINIMAL = { DATABASE_URL: 'postgres://user:pass@localhost:5432/db' };

describe('parseEnv', () => {
  it('refuses to start without DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('coerces PORT to a number', () => {
    expect(parseEnv({ ...MINIMAL, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a non-numeric PORT rather than falling back to the default', () => {
    expect(() => parseEnv({ ...MINIMAL, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('applies defaults for everything optional', () => {
    const env = parseEnv(MINIMAL);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5006);
    expect(env.CORS_ORIGIN).toBe('*');
    expect(env.SEED_ON_STARTUP).toBe(true);
  });

  it('parses SEED_ON_STARTUP as a boolean, not a truthy string', () => {
    // 'false' is a truthy string; the transform is what stops `if (env.SEED_ON_STARTUP)`
    // from being unconditionally true.
    expect(parseEnv({ ...MINIMAL, SEED_ON_STARTUP: 'false' }).SEED_ON_STARTUP).toBe(false);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ ...MINIMAL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
