import {storage} from '../../../lib/storage';
import {initialState,processRows,replayData,addAudit} from '../../../lib/engine';
import {collectOfficial} from '../../../lib/collector';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
 let loaded:any;try{loaded=await storage.read('live:live');if(!loaded){const s=initialState('live','live');processRows(s,replayData.records[s.date],s.date,'live','보관 원본 초기값');await storage.create('live:live',s);loaded=await storage.read('live:live')};const s=structuredClone(loaded.state);const got=await collectOfficial(s);s.settings.scheduleState='Vercel 매일08시 예약';await storage.save('live:live',s,loaded.version);return Response.json({ok:true,dataDate:s.date,rows:s.latestRows.length,newCount:got.result?.newCount||0,actualMessagesSent:false})}
 catch(e){const error=e instanceof Error?e.message:'Collection failed';if(loaded){try{addAudit(loaded.state,'수집 오류',error,'Vercel 정기 점검');loaded.state.lastError=error;await storage.save('live:live',loaded.state,loaded.version)}catch{}}return Response.json({ok:false,error},{status:503})}
}
