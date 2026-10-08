import {processRows,modelData,replayData,dayAdd,kstDate,type OpsState,type RecordRow} from './engine';
export async function collectOfficial(s:OpsState){
 const target=dayAdd(kstDate(),-1),start=s.date<target?dayAdd(s.date,1):target,first=start<dayAdd(target,-6)?dayAdd(target,-6):start;
 const body=new URLSearchParams({ixrName:'',startDate:first.replaceAll('-',''),endDate:target.replaceAll('-',''),startItem:'1',endItem:'900000'});
 const res=await fetch(replayData.sourceUrl,{method:'POST',headers:{'User-Agent':'cheonan-data-review/1.0','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':'https://its.cheonan.go.kr/stat/sis-stat.do'},body:body.toString(),signal:AbortSignal.timeout(40000)});
 if(!res.ok)throw Error(`공식 통계 조회 실패(${res.status}) · 기존 업무 유지`);
 const raw=await res.json() as any;if(!Array.isArray(raw.resultList)||!raw.resultList.length)throw Error('공식 조회 결과가 비어 있습니다.');if(Number(raw.resultList[0].ROW_CNT)>raw.resultList.length)throw Error('전체 결과가 수집되지 않아 판정을 보류했습니다.');
 const by=new Map<string,RecordRow[]>();for(const r of raw.resultList){if(typeof r.STAT_DT!=='string'||r.STAT_DT<first||r.STAT_DT>target||typeof r.ACRD_NM!=='string')throw Error('원본 날짜·방향 형식 오류');const hours=Array.from({length:24},(_,h)=>r['IXR_STAT_DT_'+String(h).padStart(2,'0')]);if(hours.some(x=>typeof x!=='number'))throw Error('시간값 누락');by.set(r.STAT_DT,[...(by.get(r.STAT_DT)||[]),{approach:r.ACRD_NM,count:r.TOTAL_TFVL,hours}])}
 let result:any;for(let d=first;d<=target;d=dayAdd(d,1)){const rows=by.get(d);if(!rows||rows.length<Math.floor(Object.keys(modelData.live.medians).length*.95))throw Error(`${d} 완결 데이터 부족 · 판정 보류`);result=processRows(s,rows,d,'live','공식 원본 자동 수집')};return {result,raw,first,target};
}
