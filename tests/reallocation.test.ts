import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveActivities,reserveSummary,coreProject,additionalProject,transferredProject} from '../lib/reallocation';
import {buildCurrentReport} from '../lib/public-report-build';
const a=(code:string,budget:number,id=code)=>({id,project_code:code,project_name:code,name:code,agency:'',budget,baseline_disbursed:0,baseline_date:'2026-11-10',fiscal_year:2570,source_row:code==='RESERVE'?0:10});
test('ten original projects are distinct from P11 and reserve-funded T codes',()=>{
 assert.equal(coreProject('P10'),true);
 assert.equal(coreProject('P11'),false);
 assert.equal(additionalProject('P11'),true);
 assert.equal(transferredProject('T01'),true);
});
test('P11 restored with 600000 allocation keeps total budget unchanged',()=>{
 const original=[a('P01',5220000),a('RESERVE',672700),a('P11',600000,'p11')];
 const transfers=[{activity_id:'p11',allocated_on:'2026-11-13',amount:600000}];
 const before=effectiveActivities(original,transfers,'2026-11-12');
 const after=effectiveActivities(original,transfers,'2026-11-13');
 assert.equal(before.some(x=>x.project_code==='P11'),false);
 assert.equal(before.find(x=>x.project_code==='RESERVE')?.budget,672700);
 assert.equal(after.find(x=>x.project_code==='RESERVE')?.budget,72700);
 assert.equal(before.reduce((sum,x)=>sum+x.budget,0),after.reduce((sum,x)=>sum+x.budget,0));
 assert.equal(buildCurrentReport(after,[],'2026-11-13')?.totals.budget,5892700);
 assert.deepEqual(reserveSummary(original,transfers,'2026-11-13'),{initial:672700,allocated:600000,remaining:72700});
});
test('two further reserve-funded allocations never double count the budget',()=>{
 const original=[a('RESERVE',672700),a('T01',500000,'a'),a('T02',172700,'b')];
 const transfers=[{activity_id:'a',allocated_on:'2026-11-13',amount:500000},
  {activity_id:'b',allocated_on:'2026-11-14',amount:172700}];
 const visible=effectiveActivities(original,transfers,'2026-11-14');
 assert.equal(visible.reduce((sum,r)=>sum+r.budget,0),672700);
 assert.equal(reserveSummary(original,transfers,'2026-11-14').remaining,0);
});
