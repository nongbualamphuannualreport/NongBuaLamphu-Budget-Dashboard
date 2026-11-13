import type {MonitorEntry} from './monitor';
export type MonitorPoEntry={
 id:string;activity_id:string;po_on:string;amount:number;kind:'add'|'release'|'pay';
 reference:string;note:string;related_payment_id:string|null;created_at:string
};
export const moneyCents=(n:number)=>Math.round(n*100)/100;
export function poBalance(entries:Pick<MonitorPoEntry,'activity_id'|'po_on'|'amount'>[],id:string,asOf:string){
 return moneyCents(entries.filter(e=>e.activity_id===id&&e.po_on<=asOf).reduce((v,e)=>v+Number(e.amount),0));
}
/** Evaluate outstanding contracts and actual payments together over time. */
export function validateCombinedLedger(
 budget:number,baseline:number,openingDate:string,
 entries:Pick<MonitorEntry,'paid_on'|'amount'>[],
 po:Pick<MonitorPoEntry,'po_on'|'amount'>[]
){
 if(!Number.isFinite(budget)||!Number.isFinite(baseline)||baseline<0||baseline>budget)throw Error('วงเงินตั้งต้นไม่ถูกต้อง');
 const days=new Map<string,{paid:number;po:number}>();
 for(const e of entries){
  if(e.paid_on<openingDate||!Number.isFinite(Number(e.amount)))throw Error('วันที่หรือยอดเบิกจ่ายไม่ถูกต้อง');
  const day=days.get(e.paid_on)??{paid:0,po:0};day.paid+=Number(e.amount);days.set(e.paid_on,day);
 }
 for(const e of po){
  if(e.po_on<openingDate||!Number.isFinite(Number(e.amount)))throw Error('วันที่หรือยอด PO ไม่ถูกต้อง');
  const day=days.get(e.po_on)??{paid:0,po:0};day.po+=Number(e.amount);days.set(e.po_on,day);
 }
 let paid=baseline,outstanding=0;
 for(const [date,v] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  paid=moneyCents(paid+v.paid);outstanding=moneyCents(outstanding+v.po);
  if(paid<-.005||outstanding<-.005)throw Error('ยอด PO หรือเบิกจ่ายติดลบ ณ '+date);
  if(paid+outstanding>budget+.005)throw Error('ยอด PO รวมเบิกจ่ายเกินวงเงินกิจกรรม ณ '+date);
 }
 return {paid,outstanding,available:moneyCents(budget-paid-outstanding)};
}
