import {collectOfficial} from '../../../lib/collector';
import {storage} from '../../../lib/storage';
import {initialState,replayRun,processRows,replayData,modelData,assess,modelForState,getSeries,buildContact,addAudit,dayAdd,kstDate,STATUS,type OpsState,type RecordRow} from '../../../lib/engine';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
function json(x:any,status=200){return Response.json(x,{status,headers:{'Cache-Control':'no-store'}})}
const db=storage;
async function load(key:string){let row=await db.read(key);if(!row){const [mode,scenario]=key.split(':');const s=initialState(mode,scenario);if(mode==='replay')replayRun(s,s.date);else processRows(s,replayData.records[s.date],s.date,'live','보관 원본 초기값');await db.create(key,s);row=await db.read(key)}return {state:row!.state,revision:row!.version}}
async function save(key:string,s:OpsState,revision:number){await db.save(key,s,revision)}
function keyOf(mode:string,scenario:string){if(!['replay','live'].includes(mode))throw new Error('잘못된 모드입니다.');if(mode==='replay'&&!replayData.scenarios.some((s:any)=>s.id===scenario))throw new Error('사례를 찾을 수 없습니다.');return mode+':'+(mode==='live'?'live':scenario)}
function view(s:OpsState){return {...s,analysis:assess(s.latestRows,s.date,modelForState(s)),scenarios:replayData.scenarios,model:{algorithm:modelData[modelForState(s)].algorithm,trainedThrough:modelData[modelForState(s)].trainedThrough,trainingRows:modelData[modelForState(s)].trainingRows},source:{url:replayData.sourceUrl,retrievedAt:replayData.retrievedAt},schedule:{time:'08:00',timezone:'Asia/Seoul',target:'전날 완결 데이터',status:'Vercel 08시 예약 · 요금제에 따른 실행 시각 오차 가능',lastRun:s.runs[0]||null},meta:replayData.meta}}
export async function GET(request:Request){try{const u=new URL(request.url);if(u.searchParams.has('help'))return json({source:replayData.sourceUrl,update:{method:'POST',body:{action:'collect',mode:'live',scenario:'live'},scope:'owner-private shared workspace',time:'매일08:00 Asia/Seoul',target:'전날부터 누락 완결일을7일 범위 내 재조회',retry:'1회 실패는 기존 상태 유지. 저장결과GET으로 확인. 발송 기능은 시연만 가능.'},readback:'/api/ops?mode=live&scenario=live'});const mode=u.searchParams.get('mode')||'replay',scenario=u.searchParams.get('scenario')||'printing';const {state}=await load(keyOf(mode,scenario));if(u.searchParams.get('series'))return json({series:getSeries(state,u.searchParams.get('series')!)});return json(view(state))}catch(e){return json({error:e instanceof Error?e.message:'업무 목록을 불러오지 못했습니다.'},503)}}
export async function POST(request:Request){
 let key='',loaded:any;
 try{
  const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'이 화면에서 요청을 다시 실행하세요.'},403);
  const b=await request.json() as any;key=keyOf(b.mode||'replay',b.scenario||'printing');loaded=await load(key);let s=loaded.state as OpsState;const actor='웹앱 담당자';let result:any={};
  if(b.action==='reset'){if(s.mode!=='replay')throw new Error('실데이터 업무는 초기화할 수 없습니다.');s=initialState('replay',s.scenario);replayRun(s,s.date);addAudit(s,'재생 초기화','시연 사례의 업무 상태만 초기화',actor)}
  else if(b.action==='replay'){if(s.mode!=='replay')throw new Error('과거 재생 모드에서만 실행할 수 있습니다.');result=replayRun(s,String(b.date))}
  else if(b.action==='collect'){
   if(s.mode!=='live')throw new Error('실데이터 모드에서 수집하세요.');const got=await collectOfficial(s);result=got.result;
  }
  else if(b.action==='settings'){
   const v=b.settings||{};for(const k of ['owner','vendorName','vendorEmail','vendorPhone']){if(typeof v[k]==='string'){if(v[k].length>120)throw new Error('입력값이 너무 깁니다.');s.settings[k]=v[k].trim()}}
   if(s.settings.vendorEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.settings.vendorEmail))throw new Error('메일 주소 형식을 확인하세요.');if(s.settings.vendorPhone&&!/^[0-9+() -]{7,30}$/.test(s.settings.vendorPhone))throw new Error('전화번호 형식을 확인하세요.');s.settings.popup=!!v.popup;addAudit(s,'연락처 설정 변경','업무 담당 및 정비 연락처 변경 · 실제발송 미연결',actor);
  }
  else{
   const c=s.cases.find(x=>x.id===b.caseId);if(!c)throw new Error('업무 건을 찾을 수 없습니다.');
   if(b.action==='assign'){const a=String(b.assignee||'').trim();if(!a||a.length>60)throw new Error('담당자를 입력하세요.');c.assignee=a;c.status='검토 중';c.lastAction='담당 배정';addAudit(s,'담당 배정',`${c.approach} · ${a}`,actor)}
   else if(b.action==='ack'){c.status='검토 중';addAudit(s,'확인 시작',c.approach,actor)}
   else if(b.action==='cause'){const cause=String(b.cause||'미확인');if(!['미확인','장비·검지 설정','공개 전송·통신','공사·통행 변화','기타'].includes(cause))throw new Error('원인 분류를 확인하세요.');const note=String(b.note||'').trim();if(note.length>1500)throw new Error('메모는1500자 이내입니다.');if(cause!=='미확인'&&!note)throw new Error('확인 근거와 메모를 입력하세요.');c.cause=cause;c.note=note;if(cause==='공사·통행 변화')c.status='실제 통행 변화';addAudit(s,'원인 검토 기록',`${c.approach} · ${cause} · ${note}`,actor)}
   else if(b.action==='draft'){const channel=b.channel==='sms'?'sms':'email';result={draft:buildContact(c,s,channel)};return json({state:view(s),...result})}
   else if(b.action==='simulateSend'){
    if(['종료','실제 통행 변화'].includes(c.status))throw new Error('종료된 건은 통지할 수 없습니다.');if(c.assignee==='미배정')throw new Error('담당자를 배정한 뒤 연락 내용을 검토하세요.');const channel=b.channel==='sms'?'sms':'email';const draft=buildContact(c,s,channel);const edited=String(b.body||draft.body).trim();if(!edited||edited.length>5000)throw new Error('연락 내용을 확인하세요.');if(!draft.recipient)throw new Error('설정에서 해당 채널의 정비업체 연락처를 입력하세요.');if(b.confirm!==true)throw new Error('연락 내용과 수신자를 검토하세요.');
    const old=s.outbox.find(o=>o.caseId===c.id&&o.channel===channel&&o.dataDate===s.date);if(old)return json({state:view(s),message:'같은 날짜·채널의 시연 통지 이력이 있어 중복 생성하지 않았습니다.'});const o={id:crypto.randomUUID(),caseId:c.id,approach:c.approach,channel,recipient:draft.recipient,subject:draft.subject,body:edited,dataDate:s.date,at:new Date().toISOString(),status:'발송 시연 완료',actualSent:false,actor};s.outbox.unshift(o);c.lastNotification=o.at;c.status='정비 확인 중';addAudit(s,'정비 통지 시연',`${c.approach} · ${channel==='sms'?'문자':'메일'} · 외부 발송 없음`,actor);result.message='통지 시연을 기록했습니다. 실제 메일·문자는 발송되지 않았습니다.';
   }
   else if(b.action==='close'){if(c.recoveryDays<s.settings.recoveryDays)throw new Error(`회복 수준이 ${s.settings.recoveryDays}일 유지됐는지 먼저 확인하세요.`);if(c.cause==='미확인'||!c.note)throw new Error('원인 확인 근거를 기록한 뒤 종료하세요.');c.status='종료';addAudit(s,'검토 종료',`${c.approach} · ${c.recoveryDays}일 회복 관측 · ${c.cause}`,actor)}
   else throw new Error('지원하지 않는 작업입니다.');
  }
  await save(key,s,loaded.revision);return json({state:view(s),...result});
 }catch(e){const msg=e instanceof Error?e.message:'작업을 완료하지 못했습니다.';return json({error:msg},400)}
}
