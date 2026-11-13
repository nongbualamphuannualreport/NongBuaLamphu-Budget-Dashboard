// PDF-only layout model. A project appears once, followed by all its activities.
export type PdfProject={code:string;name:string;budget:number;paid:number;remaining:number};
export type PdfActivity={id:string;project_code:string;name:string;agency:string;budget:number;cumulative:number;remaining:number};
export type PdfDetailItem=
 | {kind:'project';project:PdfProject;ordinal:number}
 | {kind:'activity';row:PdfActivity;ordinal:number};
const estimatedProjectHeight=(p:PdfProject)=>90+Math.ceil((p.name||'').length/39)*21;
const estimatedActivityHeight=(a:PdfActivity)=>63+
 Math.max(1,Math.ceil((a.name||'').length/42))*21+
 Math.max(1,Math.ceil((a.agency||'').length/62))*16;
export function paginatePdfProjectDetails(projects:PdfProject[],activities:PdfActivity[]):PdfDetailItem[][]{
 const pages:PdfDetailItem[][]=[[]];
 let used=0;
 let capacity=805; // The first detail page has the report heading.
 const startNext=()=>{pages.push([]);used=0;capacity=900;};
 const push=(entry:PdfDetailItem,cost:number)=>{
  if(used+cost>capacity&&pages[pages.length-1].length)startNext();
  pages[pages.length-1].push(entry);used+=cost;
 };
 const ordered=[...projects].sort((a,b)=>a.code==='RESERVE'?1:b.code==='RESERVE'?-1:a.code.localeCompare(b.code,'th'));
 ordered.forEach((project,index)=>{
  const group=project.code==='RESERVE'?[]:activities.filter(a=>a.project_code===project.code);
  const cost=estimatedProjectHeight(project);
  const first=group.length?estimatedActivityHeight(group[0]):0;
  // Never orphan a project heading at the bottom of a page.
  if(used+cost+first>capacity&&pages[pages.length-1].length)startNext();
  push({kind:'project',project,ordinal:index+1},cost);
  group.forEach((row,i)=>push({kind:'activity',row,ordinal:i+1},estimatedActivityHeight(row)));
 });
 return pages.filter(page=>page.length);
}

/**
 * Repack pages using actual rendered block heights measured in the browser.
 * Static character-count estimates often waste half an A4 page for Thai text.
 * capacities are measured after subtracting the title, footer clearance,
 * last-page total and a small anti-clipping safety margin.
 */
export function paginateMeasuredPdfDetails(
 entries:PdfDetailItem[],heights:number[],firstCapacity:number,otherCapacity:number
):PdfDetailItem[][]{
 if(entries.length!==heights.length)throw Error('จำนวนรายการและความสูงที่วัดได้ไม่ตรงกัน');
 if(!Number.isFinite(firstCapacity)||!Number.isFinite(otherCapacity)||firstCapacity<=0||otherCapacity<=0)
  throw Error('ขนาดพื้นที่รายงานไม่ถูกต้อง');
 if(!entries.length)return [];
 const pages:PdfDetailItem[][]=[[]];
 let used=0;
 let capacity=firstCapacity;
 const newPage=()=>{pages.push([]);used=0;capacity=otherCapacity;};
 for(let i=0;i<entries.length;i++){
  const item=entries[i];
  const h=heights[i];
  if(!Number.isFinite(h)||h<=0)throw Error('ไม่สามารถวัดความสูงรายการในรายงานได้');
  // A heading should travel with the first activity whenever they fit together.
  const firstChild=item.kind==='project'&&entries[i+1]?.kind==='activity'
   ?heights[i+1] : 0;
  const need=h+(firstChild>0&&h+firstChild<=capacity?firstChild:0);
  if(pages[pages.length-1].length&&used+need>capacity)newPage();
  pages[pages.length-1].push(item);used+=h;
 }
 return pages.filter(page=>page.length);
}
