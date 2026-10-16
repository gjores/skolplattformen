import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarDate, calendarDateValue, calendarDateError, calendarIsoWeek } from './calendar-date.ts';
test('calendar dates round-trip across timezones and DST without an instant conversion',()=>{
 const old=process.env.TZ;
 try {for(const zone of ['Europe/Stockholm','America/Los_Angeles','Pacific/Kiritimati']){process.env.TZ=zone;for(const value of ['2024-02-29','2026-03-29','2026-10-25','2026-12-31','2027-01-01','0099-01-01'])assert.equal(calendarDateValue(parseCalendarDate(value)),value);}}
 finally {if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('invalid and partial dates are never normalized to a different day; bounds are inclusive',()=>{
 for(const value of ['2026-02-29','2024-02-30','2026-13-01','2026-1-01','0000-01-01','2026-01','2026-01-01T00:00:00Z'])assert.equal(parseCalendarDate(value),undefined);
 assert.equal(calendarDateError(''), '');assert.equal(calendarDateError('2024-02-29','2024-02-29','2024-02-29'),'');
 assert.match(calendarDateError('2024-02-28','2024-02-29'),/senare/);assert.match(calendarDateError('2024-03-01',undefined,'2024-02-29'),/tidigare/);
});
test('ISO week numbers include the actual week-year at New Year',()=>{
 for(const [value,year,week]of [['2026-12-31',2026,53],['2027-01-01',2026,53],['2027-01-04',2027,1],['2024-12-30',2025,1]])assert.deepEqual(calendarIsoWeek(parseCalendarDate(value)),{year,week});
});
