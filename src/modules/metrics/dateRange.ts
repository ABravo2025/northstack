export interface DateRange {
  since: Date;
  until: Date;
}

const DEFAULT_MONTHS_BACK = 6;
// A little slack past a year of history — enough for "this year" and
// "last 6 months" without letting an open-ended range make every query scan
// the tenant's entire history by accident.
const MAX_RANGE_DAYS = 400;

function defaultRange(): DateRange {
  const until = new Date();
  const since = new Date(until);
  since.setMonth(since.getMonth() - DEFAULT_MONTHS_BACK);
  return { since, until };
}

// GET /api/tenant-metrics/overview?since=<ISO>&until=<ISO> — both required
// together (a lone `since` or `until` falls back to the default rather than
// guessing the other bound). Invalid/out-of-order/too-wide input also falls
// back, rather than 400ing — this endpoint is read-only and low-stakes
// enough that "give a sane default" beats "reject the request".
export function parseDateRange(query: { since?: unknown; until?: unknown }): DateRange {
  if (typeof query.since !== 'string' || typeof query.until !== 'string') {
    return defaultRange();
  }
  const since = new Date(query.since);
  const until = new Date(query.until);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since > until) {
    return defaultRange();
  }
  const rangeDays = (until.getTime() - since.getTime()) / 86400000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return defaultRange();
  }
  return { since, until };
}
