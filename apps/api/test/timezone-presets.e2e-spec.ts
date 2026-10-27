import { execFileSync } from 'child_process';
import * as path from 'path';
import {
  getTomorrowPresetKolkata,
  parseKolkataDateTimeInput,
  toKolkataInputString,
  formatKolkataDisplay,
} from '@vit-carpool/contracts';

describe('Asia/Kolkata Deterministic Timezone and Preset Handling', () => {
  describe('In-process deterministic calculations across calendar boundaries', () => {
    it('produces 08:30 on the next Kolkata calendar day from a mid-day Kolkata time', () => {
      // 2026-10-27 14:00 UTC = 2026-10-27 19:30 Asia/Kolkata
      const anchor = new Date('2026-10-27T14:00:00.000Z');
      const preset = getTomorrowPresetKolkata(anchor, 8, 30);
      expect(preset).toBe('2026-10-28T08:30');

      const parsed = parseKolkataDateTimeInput(preset);
      expect(parsed.toISOString()).toBe('2026-10-28T03:00:00.000Z');
      expect(formatKolkataDisplay(preset)).toContain('8:30 am IST');
    });

    it('correctly increments Kolkata calendar day when UTC is still previous day', () => {
      // 2026-10-27 20:00 UTC = 2026-10-28 01:30 Asia/Kolkata (past midnight in Kolkata)
      const anchor = new Date('2026-10-27T20:00:00.000Z');
      const preset = getTomorrowPresetKolkata(anchor, 8, 30);
      // Kolkata is already on Oct 28, so tomorrow preset must be Oct 29!
      expect(preset).toBe('2026-10-29T08:30');

      const parsed = parseKolkataDateTimeInput(preset);
      expect(parsed.toISOString()).toBe('2026-10-29T03:00:00.000Z');
    });

    it('handles month-end rollover deterministically in Asia/Kolkata', () => {
      // 2026-10-31 16:00 UTC = 2026-10-31 21:30 Asia/Kolkata
      const anchor = new Date('2026-10-31T16:00:00.000Z');
      const preset = getTomorrowPresetKolkata(anchor, 8, 30);
      expect(preset).toBe('2026-11-01T08:30');

      const parsed = parseKolkataDateTimeInput(preset);
      expect(parsed.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    });

    it('handles year-end rollover deterministically in Asia/Kolkata', () => {
      // 2026-12-31 17:00 UTC = 2026-12-31 22:30 Asia/Kolkata
      const anchor = new Date('2026-12-31T17:00:00.000Z');
      const preset = getTomorrowPresetKolkata(anchor, 8, 30);
      expect(preset).toBe('2027-01-01T08:30');

      const parsed = parseKolkataDateTimeInput(preset);
      expect(parsed.toISOString()).toBe('2027-01-01T03:00:00.000Z');
    });

    it('handles leap-year February boundary correctly in Asia/Kolkata', () => {
      // 2028 is a leap year; 2028-02-28 17:00 UTC = 2028-02-28 22:30 IST
      const anchor = new Date('2028-02-28T17:00:00.000Z');
      const preset = getTomorrowPresetKolkata(anchor, 8, 30);
      expect(preset).toBe('2028-02-29T08:30');
    });

    it('relative presets (+30m, +1h, +2h) compute valid future times and parse accurately', () => {
      const nowMs = Date.now();
      const offsets = [30, 60, 120];

      for (const mins of offsets) {
        const futureDate = new Date(nowMs + mins * 60 * 1000);
        const inputStr = toKolkataInputString(futureDate);
        const parsed = parseKolkataDateTimeInput(inputStr);

        // Within 60 seconds (accounting for second truncation in YYYY-MM-DDTHH:mm input format)
        expect(Math.abs(parsed.getTime() - futureDate.getTime())).toBeLessThanOrEqual(60 * 1000);
        // Valid future departure
        expect(parsed.getTime()).toBeGreaterThan(nowMs);
      }
    });

    it('parseKolkataDateTimeInput consistently pins unqualified datetime strings to IST (+05:30)', () => {
      const input = '2026-10-28T08:30';
      const parsed = parseKolkataDateTimeInput(input);
      // 08:30 IST is 03:00 UTC (8h30m - 5h30m = 3h00m)
      expect(parsed.getUTCHours()).toBe(3);
      expect(parsed.getUTCMinutes()).toBe(0);
      expect(parsed.toISOString()).toBe('2026-10-28T03:00:00.000Z');
    });
  });

  describe('Multi-timezone host process simulation (Asia/Kolkata, UTC, America/New_York, America/Los_Angeles)', () => {
    // Tests execution in isolated node processes with explicit TZ environment variables
    const contractsDistPath = path.resolve(__dirname, '../../../packages/contracts/dist/index.js');

    const runInTimezone = (tz: string, code: string): string => {
      return execFileSync('node', ['-e', code], {
        env: {
          ...process.env,
          TZ: tz,
        },
        encoding: 'utf-8',
      }).trim();
    };

    it('returns exact 08:30 Asia/Kolkata next day when host timezone is Asia/Kolkata', () => {
      const script = `
        const { getTomorrowPresetKolkata, parseKolkataDateTimeInput } = require('${contractsDistPath}');
        const anchor = new Date('2026-10-27T14:00:00.000Z');
        const preset = getTomorrowPresetKolkata(anchor, 8, 30);
        const parsed = parseKolkataDateTimeInput(preset);
        console.log(JSON.stringify({ preset, iso: parsed.toISOString() }));
      `;
      const output = JSON.parse(runInTimezone('Asia/Kolkata', script));
      expect(output.preset).toBe('2026-10-28T08:30');
      expect(output.iso).toBe('2026-10-28T03:00:00.000Z');
    });

    it('returns exact 08:30 Asia/Kolkata next day when host timezone is UTC', () => {
      const script = `
        const { getTomorrowPresetKolkata, parseKolkataDateTimeInput } = require('${contractsDistPath}');
        const anchor = new Date('2026-10-27T14:00:00.000Z');
        const preset = getTomorrowPresetKolkata(anchor, 8, 30);
        const parsed = parseKolkataDateTimeInput(preset);
        console.log(JSON.stringify({ preset, iso: parsed.toISOString() }));
      `;
      const output = JSON.parse(runInTimezone('UTC', script));
      expect(output.preset).toBe('2026-10-28T08:30');
      expect(output.iso).toBe('2026-10-28T03:00:00.000Z');
    });

    it('returns exact 08:30 Asia/Kolkata next day when host timezone is west of UTC (America/New_York)', () => {
      const script = `
        const { getTomorrowPresetKolkata, parseKolkataDateTimeInput } = require('${contractsDistPath}');
        const anchor = new Date('2026-10-27T14:00:00.000Z');
        const preset = getTomorrowPresetKolkata(anchor, 8, 30);
        const parsed = parseKolkataDateTimeInput(preset);
        console.log(JSON.stringify({ preset, iso: parsed.toISOString() }));
      `;
      const output = JSON.parse(runInTimezone('America/New_York', script));
      expect(output.preset).toBe('2026-10-28T08:30');
      expect(output.iso).toBe('2026-10-28T03:00:00.000Z');
    });

    it('returns exact 08:30 Asia/Kolkata next day when host timezone is west of UTC (America/Los_Angeles)', () => {
      const script = `
        const { getTomorrowPresetKolkata, parseKolkataDateTimeInput } = require('${contractsDistPath}');
        const anchor = new Date('2026-10-27T14:00:00.000Z');
        const preset = getTomorrowPresetKolkata(anchor, 8, 30);
        const parsed = parseKolkataDateTimeInput(preset);
        console.log(JSON.stringify({ preset, iso: parsed.toISOString() }));
      `;
      const output = JSON.parse(runInTimezone('America/Los_Angeles', script));
      expect(output.preset).toBe('2026-10-28T08:30');
      expect(output.iso).toBe('2026-10-28T03:00:00.000Z');
    });

    it('correctly identifies next Kolkata calendar day from America/New_York when NY is Oct 27 afternoon but Kolkata is Oct 28 early morning', () => {
      // 2026-10-27 20:00 UTC = 16:00 EDT (Oct 27) = 01:30 IST (Oct 28)
      const script = `
        const { getTomorrowPresetKolkata, parseKolkataDateTimeInput } = require('${contractsDistPath}');
        const anchor = new Date('2026-10-27T20:00:00.000Z');
        const preset = getTomorrowPresetKolkata(anchor, 8, 30);
        const parsed = parseKolkataDateTimeInput(preset);
        console.log(JSON.stringify({ preset, iso: parsed.toISOString() }));
      `;
      const output = JSON.parse(runInTimezone('America/New_York', script));
      // In New York it is Oct 27, but in Kolkata it is already Oct 28!
      // Therefore "Tomorrow 8:30 AM" must be Oct 29 8:30 AM IST.
      expect(output.preset).toBe('2026-10-29T08:30');
      expect(output.iso).toBe('2026-10-29T03:00:00.000Z');
    });
  });
});
