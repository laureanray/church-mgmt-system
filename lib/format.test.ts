import { expect, it } from "bun:test";
import { inEachProcessTimeZone } from "../tests/support/time-zones";
import {
  formatDate,
  formatDateTime,
  formatMeeting,
  formatMonthDay,
  formatTime,
  formatTimeOfDay,
  initials,
  toDateTimeLocal,
} from './format';

it('preserves calendar dates across year and leap-day boundaries', () => {
  expect(formatDate('2024-02-29')).toBe('Feb 29, 2024');
  expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  expect(formatDate(null)).toBe('—');
  expect(formatDate('invalid')).toBe('invalid');
  expect(formatDateTime('invalid')).toBe('—');
});
it('fills datetime inputs with church time, whatever zone the process is in', () => {
  inEachProcessTimeZone(() => {
    expect(toDateTimeLocal(new Date('2026-01-01T09:05:00+08:00'))).toBe('2026-01-01T09:05');
  });
});
it('shows instants in church time, so server and browser agree', () => {
  inEachProcessTimeZone(() => {
    // A 9:05 AM Manila check-in, which the server on UTC used to show as 1:05 AM.
    const checkIn = new Date('2026-09-27T01:05:00Z');
    expect(formatTime(checkIn)).toBe('9:05 AM');
    expect(formatDateTime(checkIn)).toBe('Sep 27, 2026, 9:05 AM');
    // Before 8 AM in Manila it is still yesterday in UTC.
    expect(formatDateTime(new Date('2026-09-26T23:30:00Z'))).toBe('Sep 27, 2026, 7:30 AM');
  });
});
it('shows a schedule time of day as written', () => {
  inEachProcessTimeZone(() => {
    expect(formatTimeOfDay('09:00')).toBe('9:00 AM');
    expect(formatTimeOfDay('18:30')).toBe('6:30 PM');
    expect(formatMeeting(3, '19:00', null)).toBe('Wed · 7:00 PM');
  });
});
it('keeps calendar dates whatever zone the process is in', () => {
  inEachProcessTimeZone(() => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatMonthDay('2027-01-02')).toBe('Sat, Jan 2');
  });
});
it('renders optional meeting details and handles empty names', () => {
  expect(formatMeeting(0, null, 'Room 2')).toBe('Sun · Room 2');
  expect(formatMeeting(null, null, null)).toBe('—');
  expect(initials(' Ana  Santos ')).toBe('AS');
  expect(initials(' ')).toBe('?');
});
it('formats a celebration day with its weekday and no year', () => {
  expect(formatMonthDay('2027-01-02')).toBe('Sat, Jan 2');
  expect(formatMonthDay(null)).toBe('—');
});
