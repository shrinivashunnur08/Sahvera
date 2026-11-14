/**
 * Utilities for formatting and computing clean, real-world IST (Asia/Kolkata)
 * date/time strings without hardcoded placeholder years.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns YYYY-MM-DDTHH:mm in IST for N days from now at the given hour/minute.
 */
export function getUpcomingIstDateTimeLocal(
  daysAhead = 1,
  hour = 18,
  minute = 0,
  nowMs = Date.now()
): string {
  const istTarget = new Date(nowMs + IST_OFFSET_MS + daysAhead * 24 * 60 * 60 * 1000);
  const y = istTarget.getUTCFullYear();
  const m = pad2(istTarget.getUTCMonth() + 1);
  const d = pad2(istTarget.getUTCDate());
  return `${y}-${m}-${d}T${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Returns YYYY-MM-DDTHH:mm:ss+05:30 in IST for N days from now.
 */
export function getUpcomingIstIso(
  daysAhead = 0,
  hour = 18,
  minute = 0,
  nowMs = Date.now()
): string {
  return `${getUpcomingIstDateTimeLocal(daysAhead, hour, minute, nowMs)}:00+05:30`;
}

/**
 * Normalizes a datetime-local value ("YYYY-MM-DDTHH:mm") or ISO string into a
 * readable operator display like "15 Nov, 6:00 PM IST".
 */
export function formatIstDisplay(value: string | null | undefined): string {
  if (!value) return 'Not confirmed';
  const trimmed = value.trim();
  if (!trimmed) return 'Not confirmed';

  // Ensure naive datetime-local values are parsed as IST (+05:30)
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
      ? `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+05:30`
      : trimmed;

  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return trimmed;

  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(ms));
    return `${formatted} IST`;
  } catch {
    return trimmed;
  }
}

/**
 * Extracts a "YYYY-MM-DDTHH:mm" string suitable for <input type="datetime-local">
 */
export function toDateTimeLocalValue(isoOrLocal: string | null | undefined): string {
  if (!isoOrLocal) return '';
  const match = isoOrLocal.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : '';
}
