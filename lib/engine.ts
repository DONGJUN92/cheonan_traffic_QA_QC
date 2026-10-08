import models from './generated/models.json';
import replay from './generated/replay-data.json';
export type RecordRow={approach:string;count:number;hours:number[]|null};
export type CaseItem={id:string;approach:string;intersection:string;severity:string;firstDate:string;lastDate:string;observed:number;simple:number|null;gbm:number|null;relative:number|null;drop:number|null;reason:string;status:string;assignee:string;cause:string;note:string;recoveryDays:number;lastAction?:string;lastNotification?:string;history:any[];repeatDays:number};
export type OpsState={mode:string;scenario:string;date:string;cases:CaseItem[];audit:any[];outbox:any[];runs:any[];latestRows:RecordRow[];settings:any;lastError?:string;version:number};
export const replayData:any=replay;export const modelData:any=models;
export const STATUS=['확인 대기','검토 중','정비 확인 중','회복 관찰','종료','실제 통행 변화'];
export function dayAdd(d:string,n:number){return new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function kstDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())}
export function median(v:number[]){const a=v.filter(Number.isFinite).sort((a,b)=>a-b),n=a.length;return n?n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2:NaN}
function weekday(d:string){return (new Date(d+'T00:00:00Z').getUTCDay()+6)%7}
export function predictTree(model:any,x:number[]){let p=model.offset;for(const tree of model.trees){let i=0;while(!tree[i][5]){const n=tree[i],v=x[n[1]];i=Number.isNaN(v)?(n[6]?n[3]:n[4]):v<=n[2]?n[3]:n[4]}p+=tree[i][0]}return p}
export function assess(rows:RecordRow[],date:string,modelId:string){
 const m=modelData[modelId];if(!m)throw new Error('모델을 찾을 수 없습니다.');
 const by=new Map(rows.map(r=>[r.approach,r]));const outputs:any[]=[];const totals=new Map<string,number>();
 rows.forEach(r=>{const ix=r.approach.slice(0,r.approach.lastIndexOf('_'));totals.set(ix,(totals.get(ix)||0)+r.count)});
 const systemZero=rows.length>=50&&rows.every(r=>r.count===0);
 for(const r of rows){
  const b=m.baseline[r.approach],base=m.medians[r.approach],ix=r.approach.slice(0,r.approach.lastIndexOf('_'));
  if(!b||!base){outputs.push({...r,intersection:ix,flag:false,reason:'학습 기준 부족',simple:null,gbm:null,relative:null,severity:'보류',model:modelId});continue}
  const others=rows.filter(q=>q.approach!==r.approach&&q.approach.slice(0,q.approach.lastIndexOf('_'))===ix);
  const om=others.reduce((v,q)=>v+(m.medians[q.approach]||0),0),sv=others.reduce((v,q)=>v+q.count,0),otherLevel=om?sv/om:0;
  const cv=rows.filter(q=>q.approach!==r.approach&&(m.medians[q.approach]||0)>0&&q.count>=m.medians[q.approach]*.3).map(q=>q.count/m.medians[q.approach]);
  if(cv.length<50){outputs.push({...r,intersection:ix,flag:r.count<base*.05,simple:null,gbm:null,relative:null,drop:null,severity:'계통 확인',reason:'도시 기준 산출 불가 · 여러 방향 동시 저값',model:modelId});continue}
  const city=median(cv),w=weekday(date),simple=base*b.profile[w]*city/b.cityWeekday[w];
  const cleanSv=others.filter(q=>q.count>=m.medians[q.approach]*.3).reduce((v,q)=>v+q.count,0);
  const x=[w,b.profile[w],om?cleanSv/om:0,city/b.cityBase,city/b.cityWeekday[w],Number(date.slice(5,7)),Math.log1p(base),others.length];
  const gbm=Math.max(0,predictTree(m,x)*base),ratio=otherLevel>=.5?r.count/base/otherLevel:null;
  const simpleRatio=simple>0?r.count/simple:null,gbmRatio=gbm>0?r.count/gbm:null;
  const low=r.count<base*.05;const agree=simpleRatio!==null&&gbmRatio!==null&&simpleRatio<.4&&gbmRatio<.4;
  const relativeDrop=ratio!==null&&ratio<.4;const flag=low||(agree&&relativeDrop);
  let reason=low?(otherLevel<.5?'여러 방향 동시 저값 · 계통/공사/공개 전송 확인':'과거 기준의 5% 미만 · 공개값 원인 확인'):flag?'두 추정법보다 낮고, 다른 방향 대비도 낮음':'기준 범위 관측';
  outputs.push({...r,intersection:ix,base,simple,gbm,relative:ratio,drop:simpleRatio,severity:low?(otherLevel<.5?'계통 확인':'우선 확인'):'수준 확인',reason,flag,model:modelId,otherLevel,systemZero});
 }
 return outputs;
}
export function initialState(mode:string,scenario='printing'):OpsState{
 const sc=replayData.scenarios.find((s:any)=>s.id===scenario)||replayData.scenarios[0];
 return {mode,scenario:sc.id,date:mode==='live'?replayData.latestDate:sc.start,cases:[],audit:[],outbox:[],runs:[],latestRows:[],settings:{owner:'교통정보 담당',vendorName:'정비업체 담당자',vendorEmail:'',vendorPhone:'',popup:true,time:'08:00',timezone:'Asia/Seoul',recoveryDays:3},version:0};
}
export function addAudit(s:OpsState,action:string,detail:string,actor='담당자',date=s.date){s.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),dataDate:date,action,detail,actor});s.audit=s.audit.slice(0,300)}
export function processRows(s:OpsState,rows:RecordRow[],date:string,modelId:string,actor='오전 점검',replace=false){
 if(!rows.length)throw new Error('공식 조회 결과가 비어 있습니다. 기존 업무 목록을 유지합니다.');
 const dup=new Set<string>();for(const r of rows){if(dup.has(r.approach))throw new Error('같은 날짜·방향 중복으로 판정을 보류했습니다.');dup.add(r.approach);if(!Number.isFinite(r.count)||r.count<0)throw new Error('통행량 형식 오류로 판정을 보류했습니다.');if(r.hours&&(r.hours.length!==24||r.hours.some(x=>!Number.isFinite(x)||x<0)||r.hours.reduce((a,b)=>a+b,0)!==r.count))throw new Error('일 합계·시간값 불일치로 판정을 보류했습니다.')}
 if(s.runs.some(r=>r.dataDate===date&&r.model===modelId)&&!replace)return {newIds:[],newCount:0,unchanged:true,assessed:assess(rows,date,modelId)};
 const results=assess(rows,date,modelId);let newIds:string[]=[];let recovery=0;
 for(const r of results){
  let c=s.cases.find(c=>c.approach===r.approach&&!['종료','실제 통행 변화'].includes(c.status));
  if(r.flag){
   if(!c){c={id:crypto.randomUUID(),approach:r.approach,intersection:r.intersection,severity:r.severity,firstDate:date,lastDate:date,observed:r.count,simple:r.simple,gbm:r.gbm,relative:r.relative,drop:r.drop,reason:r.reason,status:'확인 대기',assignee:'미배정',cause:'미확인',note:'',recoveryDays:0,repeatDays:1,history:[]};s.cases.push(c);newIds.push(c.id)}
   else{if(c.lastDate!==date)c.repeatDays++;c.lastDate=date;c.observed=r.count;c.simple=r.simple;c.gbm=r.gbm;c.relative=r.relative;c.drop=r.drop;c.reason=r.reason;c.recoveryDays=0;if(c.status==='회복 관찰')c.status='검토 중'}
   if(!c.history.some(h=>h.date===date))c.history.push({date,observed:r.count,simple:r.simple,gbm:r.gbm,flag:true});
  }else if(c){
   if(c.lastDate!==date){const ok=r.drop!==null&&r.drop>=.6;c.recoveryDays=ok?(dayAdd(c.lastDate,1)===date?c.recoveryDays+1:1):0;c.lastDate=date;if(ok){c.status='회복 관찰';recovery++}}
   c.observed=r.count;c.simple=r.simple;c.gbm=r.gbm;c.relative=r.relative;c.drop=r.drop;
   if(!c.history.some(h=>h.date===date))c.history.push({date,observed:r.count,simple:r.simple,gbm:r.gbm,flag:false});
  }
 }
 s.latestRows=rows;s.date=date;s.lastError=undefined;s.version++;s.runs.unshift({id:crypto.randomUUID(),dataDate:date,displayAt:dayAdd(date,1)+' 08:00 KST',completedAt:new Date().toISOString(),rows:rows.length,newCount:newIds.length,ongoing:results.filter(r=>r.flag).length,recovery,model:modelId,trainedThrough:modelData[modelId].trainedThrough,source:actor==='과거 재생'?'공식 보관 원본':'천안시 공식 공개 통계'});s.runs=s.runs.slice(0,100);addAudit(s,'데이터 점검',`${date} · ${rows.length}방향 · 새 후보 ${newIds.length} · 반복 경보는 기존 건에 묶음`,actor,date);
 return {newIds,newCount:newIds.length,recovery,assessed:results};
}
export function replayRun(s:OpsState,date:string){const sc=replayData.scenarios.find((x:any)=>x.id===s.scenario);if(!sc||date<sc.start||date>sc.end)throw new Error('사례 재생 범위를 벗어났습니다.');if(date<s.date)throw new Error('지난 시점으로 돌아가려면 사례를 초기화하세요.');let result:any={newIds:[],newCount:0};for(let d=s.latestRows.length?dayAdd(s.date,1):sc.start;d<=date;d=dayAdd(d,1)){const rr=replayData.records[d];if(!rr)throw new Error('이 날짜의 원본이 없습니다.');result=processRows(s,rr,d,sc.model,'과거 재생')};return result}
export function modelForState(s:OpsState){return s.mode==='live'?'live':replayData.scenarios.find((x:any)=>x.id===s.scenario)?.model||'printing'}
export function getSeries(s:OpsState,approach:string){const m=modelData[modelForState(s)],b=m.medians[approach];const lo=dayAdd(s.date,-29);return Object.keys(replayData.records).filter(d=>d>=lo&&d<=s.date).map(d=>{const rows=replayData.records[d];const r=rows.find((x:any)=>x.approach===approach);if(!r)return null;const aa=assess(rows,d,modelForState(s)).find(x=>x.approach===approach);return {date:d,count:r.count,simple:aa.simple,gbm:aa.gbm}}).filter(Boolean)}
export function buildContact(c:CaseItem,s:OpsState,channel='email'){
 const subject=`[교통량 공개값 확인 요청] ${c.approach.replace('_',' ')} · ${c.firstDate}`;
 const body=`${s.settings.vendorName||'정비업체 담당자'}님,\n\n${c.approach.replace('_',' ')} 방향 공개 교통량의 점검을 요청드립니다.\n분석 대상일: ${c.lastDate}\n카메라 관리대장 ID: ${replayData.meta[c.approach]?.cameraId||'확인 전'}\n공개 관측값: ${Math.round(c.observed).toLocaleString('ko-KR')}대\n과거 시작 관측일: ${c.firstDate}\n점검 근거: ${c.reason}\n\n현재 원인은 미확인입니다. 장비 고장을 확정한 요청이 아닙니다.\n1. 장비·검지 설정·통신 상태\n2. 도로공사·통행 변경 여부\n3. 내부 저장값과 공개 전송값의 차이\n4. 확인 결과와 예정 조치 시점\n을 회신 부탁드립니다.\n\n담당: ${c.assignee==='미배정'?s.settings.owner:c.assignee}\n관리번호: ${c.id.slice(0,8)}\n※ 공개값과 분석 근거만 포함하며 카메라 영상은 첨부하지 않습니다.`;
 const sms=`[교통량 공개값 점검] ${c.approach.replace('_',' ')} ${c.lastDate} 관측 ${Math.round(c.observed)}대. 원인 미확인, 장비/공사/전송 점검 후 회신 요청. 담당 ${c.assignee==='미배정'?s.settings.owner:c.assignee}. 관리 ${c.id.slice(0,8)}.`;
 return {subject,body:channel==='sms'?sms:body,recipient:channel==='sms'?s.settings.vendorPhone:s.settings.vendorEmail,channel};
}
