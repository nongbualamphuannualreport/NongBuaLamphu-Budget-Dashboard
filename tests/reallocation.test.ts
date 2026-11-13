import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveActivities,reserveSummary,coreProject,additionalProject,transferredProject} from '../lib/reallocation';
import {buildCurrentReport} from '../lib/public-report-build';
const a=(code:string,budget:number,id=code)=>({id,project_code:code,project_name:code,name:code,agency:'',budget,baseline_disbursed:0,baseline_date:'2026-11-10',fiscal_year:2570,source_row:code==='RESERVE'?0:10});
test('core ten, additional P11 and transfers have distinct classification',()=>{
 assert.equal(coreProject('P10'),true);assert.equal(coreProject('P11'),false);
 assert.equal(additionalProject('P11'),true);assert.equal(transferredProject('T01'),true);
});
test('a transfer reallocates reserve rather than growing total budget',()=>{
 const acts=[a('P01',200000),a('P11',600000),a('RESERVE',672700),a('T01',500000,'new')];
 const transfers=[{activity_id:'new',allocated_on:'2026-11-14',amount:500000}];
 const before=effectiveActivities(acts,transfers,'2026-11-13');
 assert.equal(before.some(x=>x.project_code==='T01'),false);
 assert.equal(before.find(x=>x.project_code==='RESERVE')?.budget,672700);
 const after=effectiveActivities(acts,transfers,'2026-11-14');
 assert.equal(after.find(x=>x.project_code==='RESERVE')?.budget,172700);
 assert.equal(before.reduce((s,x)=>s+x.budget,0),after.reduce((s,x)=>s+x.budget,0));
 const rep=buildCurrentReport(after,[],'2026-11-14');
 assert.equal(rep?.totals.budget,1472700);
 assert.deepEqual(reserveSummary(acts,transfers,'2026-11-14'),{initial:672700,allocated:500000,remaining:172700});
});
test('two allocated projects cannot silently consume reserve twice in the report',()=>{
 const acts=[a('RESERVE',672700),a('T01',500000,'a'),a('T02',172700,'b')];
 const ts=[{activity_id:'a',allocated_on:'2026-11-13',amount:500000},
   {activity_id:'b',allocated_on:'2026-11-14',amount:172700}];
 const effective=effectiveActivities(acts,ts,'2026-11-14');
 assert.equal(effective.reduce((n,x)=>n+x.budget,0),672700);
 assert.equal(reserveSummary(acts,ts,'2026-11-14').remaining,0);
});
