import { expect, it } from "bun:test";
import { formatDate, formatDateTime, formatMonthDay, formatMeeting, initials, toDateTimeLocal } from './format';

it('preserves calendar dates across year and leap-day boundaries', () => {
  expect(formatDate('2024-02-29')).toBe('Feb 29, 2024');
  expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  expect(formatDate(null)).toBe('—');
  expect(formatDate('invalid')).toBe('invalid');
  expect(formatDateTime('invalid')).toBe('—');
});
it('formats local datetime inputs without converting to UTC', () => {
  expect(toDateTimeLocal(new Date(2026, 0, 1, 9, 5))).toBe('2026-01-01T09:05');
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
