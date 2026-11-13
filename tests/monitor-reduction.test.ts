import test from 'node:test';import assert from 'node:assert/strict';
import {reportRows,validateNetLedger} from '../lib/monitor';
const activity={id:'a',project_code:'P01',project_name:'โครงการ',name:'กิจกรรม',agency:'',budget:500000,baseline_disbursed:174200,baseline_date:'2026-11-10',fiscal_year:2570,source_row:1};
test('a 200 baht reduction updates net disbursement and remaining without editing baseline',()=>{
 const entries=[{id:'e',activity_id:'a',paid_on:'2026-11-13',amount:-200,reference:'',note:'เงินคืน',created_at:'2026-11-13'}];
 const r=reportRows([activity],entries,'daily','2026-11-13');
 assert.equal(r.total.disbursed,174000);assert.equal(r.total.remaining,326000);assert.equal(r.total.period,-200);
});
test('cannot reduce below earlier balance',()=>{
 assert.throws(()=>validateNetLedger(500000,100,'2026-11-10',[{paid_on:'2026-11-13',amount:-200}]));
 assert.equal(validateNetLedger(500000,174200,'2026-11-10',[{paid_on:'2026-11-13',amount:-200}]),174000);
});