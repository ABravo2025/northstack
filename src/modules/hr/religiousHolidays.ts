// Religions whose holidays a company can enable in Settings → Time Off (2026-10). A religious
// holiday is a day off ONLY for the people who have that religion (EmployeeReligiousHoliday) —
// e.g. Argentina's "días no laborables" for the Jewish and Muslim communities and the Armenian
// community's April 24.
//
// The dates below are a starting point copied into the tenant's own TimeOffHoliday rows when the
// owner enables a religion; the owner reviews and edits them there. Several of these follow lunar
// calendars (Islamic dates can also move a day with the moon sighting), so they change every year
// and no free source covers all of them reliably — hence seed + owner review rather than an import.

export const RELIGION_KEYS = ['jewish', 'muslim', 'armenian', 'orthodox'] as const;
export type ReligionKey = (typeof RELIGION_KEYS)[number];

export function isReligionKey(value: unknown): value is ReligionKey {
  return typeof value === 'string' && (RELIGION_KEYS as readonly string[]).includes(value);
}

type SeedDay = [date: string, name: string];

const SEED: Record<ReligionKey, Record<number, SeedDay[]>> = {
  jewish: {
    2026: [
      ['2026-04-02', 'Pesach (day 1)'],
      ['2026-04-03', 'Pesach (day 2)'],
      ['2026-04-08', 'Pesach (day 7)'],
      ['2026-04-09', 'Pesach (day 8)'],
      ['2026-09-12', 'Rosh Hashanah'],
      ['2026-09-13', 'Rosh Hashanah'],
      ['2026-09-21', 'Yom Kippur'],
    ],
    2027: [
      ['2027-04-22', 'Pesach (day 1)'],
      ['2027-04-23', 'Pesach (day 2)'],
      ['2027-04-28', 'Pesach (day 7)'],
      ['2027-04-29', 'Pesach (day 8)'],
      ['2027-10-02', 'Rosh Hashanah'],
      ['2027-10-03', 'Rosh Hashanah'],
      ['2027-10-11', 'Yom Kippur'],
    ],
  },
  muslim: {
    2026: [
      ['2026-03-20', 'Eid al-Fitr'],
      ['2026-05-27', 'Eid al-Adha'],
      ['2026-06-16', 'Islamic New Year'],
    ],
    2027: [
      ['2027-03-10', 'Eid al-Fitr'],
      ['2027-05-17', 'Eid al-Adha'],
      ['2027-06-06', 'Islamic New Year'],
    ],
  },
  armenian: {
    2026: [['2026-04-24', 'Day of Action for Tolerance and Respect among Peoples']],
    2027: [['2027-04-24', 'Day of Action for Tolerance and Respect among Peoples']],
  },
  orthodox: {
    2026: [
      ['2026-01-07', 'Orthodox Christmas'],
      ['2026-04-10', 'Orthodox Good Friday'],
    ],
    2027: [
      ['2027-01-07', 'Orthodox Christmas'],
      ['2027-04-30', 'Orthodox Good Friday'],
    ],
  },
};

export function seedReligiousHolidays(religion: ReligionKey, year: number): SeedDay[] {
  return SEED[religion][year] ?? [];
}
