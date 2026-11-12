import { test } from 'node:test';
import assert from 'node:assert/strict';
import {bounds,reportRows} from '../lib/monitor';
test('fiscal year 2570 is October 2026 through September 2027',()=>assert.deepEqual(bounds('yearly','2026-11-12'),['2026-10-01','2027-09-30']));
test('daily and cumulative payments must not double count baseline',()=>{
 const activities=[{id:'one',project_code:'1',project_name:'โครงการ',name:'กิจกรรม',agency:'',budget:1000,baseline_disbursed:100,baseline_date:'2026-11-10',fiscal_year:2570,source_row:1}];
 const entries=[{id:'e',activity_id:'one',paid_on:'2026-11-12',amount:50,reference:'',note:'',created_at:'2026-11-12'}];
 const day=reportRows(activities,entries,'daily','2026-11-12');
 assert.equal(day.total.disbursed,150);assert.equal(day.total.period,50);assert.equal(day.total.remaining,850);
});
