import type {MonitorActivity} from './monitor';
export type ReallocationTransfer={
 id:string;activity_id:string;project_code:string;project_name:string;activity_name:string;agency:string;
 allocated_on:string;amount:number;reference:string;note:string;created_at:string
};
export const coreProject=(code:string)=>/^P(0[1-9]|10)$/.test(code);
export const transferredProject=(code:string)=>/^T[0-9]{2,3}$/.test(code);
export const additionalProject=(code:string)=>code!=='RESERVE'&&!coreProject(code)&&!transferredProject(code);
const cent=(n:number)=>Math.round(n*100)/100;
export function effectiveActivities<T extends MonitorActivity>(
 activities:T[],transfers:Pick<ReallocationTransfer,'activity_id'|'allocated_on'|'amount'>[],asOf:string
):T[]{
 const visible=transfers.filter(t=>t.allocated_on<=asOf);
 const seen=new Set(transfers.map(t=>t.activity_id));
 const todayIds=new Set(visible.map(t=>t.activity_id));
 const moved=cent(visible.reduce((sum,t)=>sum+Number(t.amount),0));
 return activities.filter(a=>!seen.has(a.id)||todayIds.has(a.id)).map(a=>
   a.project_code==='RESERVE'?{...a,budget:cent(Number(a.budget)-moved)}:a
 );
}
export function reserveSummary(
 activities:MonitorActivity[],transfers:Pick<ReallocationTransfer,'allocated_on'|'amount'>[],asOf:string
){
 const initial=Number(activities.find(a=>a.project_code==='RESERVE')?.budget??0);
 const allocated=cent(transfers.filter(t=>t.allocated_on<=asOf).reduce((sum,t)=>sum+Number(t.amount),0));
 const remaining=cent(initial-allocated);
 if(remaining<-.005)throw Error('จำนวนเงินที่โอนมากกว่าวงเงินจากการโอนเปลี่ยนแปลง');
 return {initial,allocated,remaining};
}
