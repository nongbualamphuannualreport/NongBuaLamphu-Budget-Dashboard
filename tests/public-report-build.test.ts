import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCurrentReport} from '../lib/public-report-build';
import type {MonitorActivity} from '../lib/monitor';
const activity=(id:string,code:string,budget:number,base:number):MonitorActivity=>({
 id,project_code:code,project_name:code==='RESERVE'?'เงินเหลือจ่าย':'ตัวอย่างโครงการ',name:'กิจกรรม',
 agency:'หน่วยงาน',budget,baseline_disbursed:base,baseline_date:'2026-11-10',fiscal_year:2570,source_row:1
});
test('public report uses automatic cumulative entries and keeps reserve separate',()=>{
 const r=buildCurrentReport([activity('a','P01',1000,100),activity('reserve','RESERVE',200,0)],
  [{activity_id:'a',paid_on:'2026-11-12',amount:25}], '2026-11-12');
 assert.equal(r?.totals.budget,1200);assert.equal(r?.totals.disbursed,125);assert.equal(r?.totals.remaining,1075);
 assert.equal(r?.activities.length,1);assert.equal(r?.projects.length,2);
});
test('historical cutoff excludes future payments',()=>{
 const rows=[{activity_id:'a',paid_on:'2026-11-12',amount:25},{activity_id:'a',paid_on:'2026-11-14',amount:10}];
 assert.equal(buildCurrentReport([activity('a','P01',1000,100)],rows,'2026-11-12')?.totals.disbursed,125);
 assert.equal(buildCurrentReport([activity('a','P01',1000,100)],rows,'2026-11-14')?.totals.disbursed,135);
});
test('report rejects amounts exceeding approved activity budget',()=>{
 assert.throws(()=>buildCurrentReport([activity('a','P01',100,90)],[{activity_id:'a',paid_on:'2026-11-12',amount:15}],'2026-11-12'));
});
