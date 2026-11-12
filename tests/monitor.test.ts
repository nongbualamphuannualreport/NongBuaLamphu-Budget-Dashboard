import { test } from 'node:test';
import assert from 'node:assert/strict';
import {bounds,reportRows,validDate} from '../lib/monitor';
test('fiscal year 2570 is October 2026 through September 2027',()=>assert.deepEqual(bounds('yearly','2026-11-12'),['2026-10-01','2027-09-30']));
test('daily and cumulative payments must not double count baseline',()=>{
 const activities=[{id:'one',project_code:'1',project_name:'โครงการ',name:'กิจกรรม',agency:'',budget:1000,baseline_disbursed:100,baseline_date:'2026-11-10',fiscal_year:2570,source_row:1}];
 const entries=[{id:'e',activity_id:'one',paid_on:'2026-11-12',amount:50,reference:'',note:'',created_at:'2026-11-12'}];
 const day=reportRows(activities,entries,'daily','2026-11-12');
 assert.equal(day.total.disbursed,150);assert.equal(day.total.period,50);assert.equal(day.total.remaining,850);
});

test('monthly and yearly reports stop at the selected reference date, not future period-end',()=>{
 const acts=[{id:'one',project_code:'P01',project_name:'โครงการ',name:'กิจกรรม',agency:'',budget:1000,baseline_disbursed:100,baseline_date:'2026-11-10',fiscal_year:2570,source_row:1}];
 const entries=[{id:'a',activity_id:'one',paid_on:'2026-11-12',amount:20,reference:'',note:'',created_at:'2026-11-12'},{id:'future',activity_id:'one',paid_on:'2026-11-20',amount:40,reference:'',note:'',created_at:'2026-11-20'}];
 for(const period of ['monthly','yearly'] as const){
   const r=reportRows(acts,entries,period,'2026-11-12');
   assert.equal(r.asOf,'2026-11-12'); assert.equal(r.total.disbursed,120); assert.equal(r.total.period,20);
 }
});

test('reject impossible dates such as 31 February',()=>{
 assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2026-11-12'),true);
});
