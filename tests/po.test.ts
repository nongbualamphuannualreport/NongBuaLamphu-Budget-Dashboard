import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCombinedLedger,poBalance} from '../lib/po';
test('a 500000 purchase order is not a disbursement',()=>{
 const x=validateCombinedLedger(500000,0,'2026-11-10',[],[{po_on:'2026-11-13',amount:500000}]);
 assert.deepEqual(x,{paid:0,outstanding:500000,available:0});
});
test('paying the purchase order transfers value without changing available balance',()=>{
 const p=[{po_on:'2026-11-13',amount:500000},{po_on:'2026-11-14',amount:-500000}];
 const x=validateCombinedLedger(500000,0,'2026-11-10',[{paid_on:'2026-11-14',amount:500000}],p);
 assert.deepEqual(x,{paid:500000,outstanding:0,available:0});
 assert.equal(poBalance(p.map(a=>({...a,activity_id:'x'})),'x','2026-11-13'),500000);
 assert.equal(poBalance(p.map(a=>({...a,activity_id:'x'})),'x','2026-11-14'),0);
});
test('rejects contract over budget, negative PO, or disbursement that overcommits',()=>{
 assert.throws(()=>validateCombinedLedger(500000,0,'2026-11-10',[],[{po_on:'2026-11-13',amount:500001}]));
 assert.throws(()=>validateCombinedLedger(500000,0,'2026-11-10',[],[{po_on:'2026-11-13',amount:-1}]));
 assert.throws(()=>validateCombinedLedger(500000,0,'2026-11-10',[{paid_on:'2026-11-14',amount:100000}],[{po_on:'2026-11-13',amount:500000}]));
});
