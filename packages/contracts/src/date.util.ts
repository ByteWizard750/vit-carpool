/**
 * Asia/Kolkata (IST UTC+05:30) Date and Time Utilities
 *
 * Provides deterministic date formatting, parsing, and preset computations
 * in the Asia/Kolkata timezone regardless of the browser's or host's local timezone.
 */

export interface KolkataDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Extracts date and time components in the Asia/Kolkata timezone.
 */
export function getKolkataDateParts(date: Date = new Date()): KolkataDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * Computes the YYYY-MM-DDTHH:mm string representing a target time (default 08:30)
 * on the NEXT calendar day in the Asia/Kolkata timezone.
 *
 * Guaranteed to produce the next Kolkata calendar day regardless of the host's local timezone.
 */
export function getTomorrowPresetKolkata(
  now: Date = new Date(),
  targetHour = 8,
  targetMinute = 30,
): string {
  const kp = getKolkataDateParts(now);
  // Advance by 1 day using UTC calendar rollover (handles month ends, leap years, etc.)
  const nextDay = new Date(Date.UTC(kp.year, kp.month - 1, kp.day + 1));
  const y = nextDay.getUTCFullYear();
  const m = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nextDay.getUTCDate()).padStart(2, '0');
  const hh = String(targetHour).padStart(2, '0');
  const mm = String(targetMinute).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/**
 * Converts a JavaScript Date to a YYYY-MM-DDTHH:mm input string in Asia/Kolkata timezone.
 */
export function toKolkataInputString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Parses a YYYY-MM-DDTHH:mm string or ISO string into a JavaScript Date,
 * explicitly interpreting unqualified YYYY-MM-DDTHH:mm inputs in Asia/Kolkata (+05:30).
 */
export function parseKolkataDateTimeInput(inputStr: string): Date {
  if (!inputStr) return new Date(NaN);
  const trimmed = inputStr.trim();
  // If already contains timezone indicator (Z or +/-HH:MM), parse directly
  if (trimmed.includes('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  // If format is YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss, attach +05:30 offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    return new Date(`${withSeconds}+05:30`);
  }
  return new Date(trimmed);
}

/**
 * Formats a datetime string (ISO or YYYY-MM-DDTHH:mm) to a user-friendly display in Asia/Kolkata.
 * (e.g. "Wed, 28 Oct, 8:30 am IST")
 */
export function formatKolkataDisplay(isoOrInputStr: string): string {
  try {
    const d = parseKolkataDateTimeInput(isoOrInputStr);
    if (isNaN(d.getTime())) return isoOrInputStr;
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d) + ' IST'
    );
  } catch {
    return isoOrInputStr;
  }
}

/**
 * Generates a unique idempotency key (UUID v4 or secure random fallback).
 */
export function generateIdempotencyKey(): string {
  const gCrypto = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (gCrypto && typeof gCrypto.randomUUID === 'function') {
    return gCrypto.randomUUID();
  }
  return 'idemp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 12);
}

/**
 * Returns today's calendar date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 */
export function getKolkataTodayString(now: Date = new Date()): string {
  const kp = getKolkataDateParts(now);
  const m = String(kp.month).padStart(2, '0');
  const d = String(kp.day).padStart(2, '0');
  return `${kp.year}-${m}-${d}`;
}

/**
 * Returns the ISO weekday (1 = Monday, ..., 7 = Sunday) for a YYYY-MM-DD date string.
 * Uses midday +05:30 to avoid any UTC date edge-cases.
 */
export function getIsoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  return day === 0 ? 7 : day;
}

/**
 * Computes all applicable calendar dates (YYYY-MM-DD) between startDate and endDate
 * that match the specified ISO weekdays (1..7), bounded by a future horizon from today.
 */
export function getApplicableOccurrenceDates(
  startDateStr: string,
  endDateStr: string,
  weekdays: number[],
  horizonDays = 14,
  now: Date = new Date(),
): string[] {
  const todayStr = getKolkataTodayString(now);
  const rangeStartStr = startDateStr > todayStr ? startDateStr : todayStr;

  // Compute horizon end date in Asia/Kolkata
  const kp = getKolkataDateParts(now);
  const horizonEndDate = new Date(Date.UTC(kp.year, kp.month - 1, kp.day + horizonDays));
  const horizonYear = horizonEndDate.getUTCFullYear();
  const horizonMonth = String(horizonEndDate.getUTCMonth() + 1).padStart(2, '0');
  const horizonDay = String(horizonEndDate.getUTCDate()).padStart(2, '0');
  const horizonEndStr = `${horizonYear}-${horizonMonth}-${horizonDay}`;

  const rangeEndStr = endDateStr < horizonEndStr ? endDateStr : horizonEndStr;
  if (rangeStartStr > rangeEndStr) {
    return [];
  }

  const weekdaySet = new Set(weekdays);
  const matchingDates: string[] = [];

  // Parse start into year, month, day
  const [startYear, startMonth, startDay] = rangeStartStr.split('-').map(Number);
  let currentUtc = new Date(Date.UTC(startYear, startMonth - 1, startDay));

  while (true) {
    const y = currentUtc.getUTCFullYear();
    const m = String(currentUtc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(currentUtc.getUTCDate()).padStart(2, '0');
    const currentStr = `${y}-${m}-${d}`;

    if (currentStr > rangeEndStr) {
      break;
    }

    const isoDay = getIsoWeekday(currentStr);
    if (weekdaySet.has(isoDay)) {
      matchingDates.push(currentStr);
    }

    // Step forward 1 calendar day in UTC
    currentUtc = new Date(Date.UTC(y, currentUtc.getUTCMonth(), currentUtc.getUTCDate() + 1));
  }

  return matchingDates;
}

const WEEKDAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Formats an array of ISO weekdays (1=Mon..7=Sun) for display.
 * E.g. [1, 2, 3, 4, 5] -> "Weekdays (Mon - Fri)"
 * [1, 2, 3, 4, 5, 6, 7] -> "Every day"
 */
export function formatWeekdays(weekdays: number[]): string {
  if (!weekdays || weekdays.length === 0) return 'None';
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return 'Weekdays (Mon - Fri)';
  if (sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7) return 'Weekends (Sat - Sun)';
  return sorted.map((d) => WEEKDAY_NAMES[d] || String(d)).join(', ');
}

/**
 * Formats a 24-hour "HH:mm" time string into 12-hour format with AM/PM.
 * E.g. "08:30" -> "8:30 AM", "17:00" -> "5:00 PM"
 */
export function formatTime12Hour(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

