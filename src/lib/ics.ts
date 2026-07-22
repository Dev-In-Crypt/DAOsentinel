/**
 * ICS (RFC 5545) calendar export — see docs/specs/ics-calendar-export.md.
 *
 * Pure text templating, no I/O. Hand-rolled rather than pulling in a
 * calendar library — the subset we need (one VEVENT per proposal deadline,
 * UTC only, no recurrence) is small enough not to warrant a dependency,
 * same reasoning as the Atom feed in src/lib/feed.ts.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  url: string;
}

/** Escapes the TEXT-value special characters defined in RFC 5545 §3.3.11. */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatIcsDate(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Folds a content line at 75 octets per RFC 5545 §3.1 (CRLF + leading space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join('\r\n');
}

/**
 * Renders an RFC 5545 VCALENDAR. `generatedAt` becomes every VEVENT's
 * DTSTAMP — passed in explicitly (rather than read internally) so the
 * output stays a pure function of its inputs and is deterministic in tests.
 * Event `uid` must be stable across regenerations — calendar apps use it
 * to de-duplicate, so an unstable uid re-adds the same deadline on every
 * poll instead of updating it in place.
 */
export function toIcs(events: IcsEvent[], calName: string, generatedAt: Date): string {
  const dtstamp = formatIcsDate(generatedAt);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DAO Sentinel//Governance Calendar//EN',
    'CALSCALE:GREGORIAN',
    foldLine(`X-WR-CALNAME:${escapeIcsText(calName)}`),
  ];

  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      foldLine(`UID:${escapeIcsText(e.uid)}`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcsDate(e.start)}`,
      `DTEND:${formatIcsDate(e.end)}`,
      foldLine(`SUMMARY:${escapeIcsText(e.title)}`),
      foldLine(`URL:${escapeIcsText(e.url)}`),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
