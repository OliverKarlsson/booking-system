import { describe, expect, it } from 'vitest';
import { timezoneSchema } from '@booking/shared';
import { TIMEZONE_IDS, detectTimezone, isSelectableTimezone } from './timezones';

describe('timezone options', () => {
  it('offers real IANA identifiers', () => {
    expect(TIMEZONE_IDS).toContain('Europe/Stockholm');
    expect(TIMEZONE_IDS).toContain('America/Los_Angeles');
    expect(TIMEZONE_IDS.length).toBeGreaterThan(100);
  });

  it('never offers a value the API would reject', () => {
    // The guarantee that matters: the select is validated by the *same* shared schema the
    // server uses, so an option the user can pick cannot come back as a 400. `UTC` is the
    // live case — browsers list it, Node's tz data does not, so it would be selectable
    // here and rejected there.
    for (const id of TIMEZONE_IDS) {
      expect(timezoneSchema.safeParse(id).success).toBe(true);
    }
  });

  it('excludes UTC and the fixed-offset Etc/* zones', () => {
    expect(TIMEZONE_IDS).not.toContain('UTC');
    expect(TIMEZONE_IDS.filter((id) => id.startsWith('Etc/'))).toEqual([]);
    expect(isSelectableTimezone('UTC')).toBe(false);
    expect(isSelectableTimezone('Etc/GMT+5')).toBe(false);
  });
});

describe('detectTimezone', () => {
  it('returns a value the select can actually show', () => {
    const detected = detectTimezone();
    // Either the browser's zone is one we offer, or we pre-fill nothing and make the user
    // choose — never a value that is not in the list.
    expect(detected === '' || isSelectableTimezone(detected)).toBe(true);
  });
});
