import { describe, expect, it } from 'vitest';
import { backupDue } from '@/lib/backup';

const DAY = 86_400_000;
const now = 100 * DAY;
const due = { backupReminder: true, backupRemindAfter: now - DAY };

describe('backupDue: when the home screen reminds you to export', () => {
  it('reminds once it is time and there are 50 or more clips', () => {
    expect(backupDue(due, 50, now)).toBe(true);
    expect(backupDue({ ...due, backupRemindAfter: now }, 500, now)).toBe(true);
  });

  it('stays quiet otherwise', () => {
    expect(backupDue(due, 49, now)).toBe(false);
    expect(backupDue({ ...due, backupReminder: false }, 500, now)).toBe(false);
    expect(backupDue({ ...due, backupRemindAfter: now + DAY }, 500, now)).toBe(false);
    expect(backupDue({ ...due, backupRemindAfter: 0 }, 500, now)).toBe(false);
  });
});
