import {neon} from '@neondatabase/serverless';
import type {OpsState} from './engine';
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';
let localDb:any;
function local(){if(process.env.VERCEL||process.env.NODE_ENV==='production'||process.env.DATABASE_URL||process.env.POSTGRES_URL)return null;if(localDb)return localDb;const dir=path.resolve('.local');fs.mkdirSync(dir,{recursive:true});localDb=new DatabaseSync(path.join(dir,'state.sqlite'));localDb.exec('CREATE TABLE IF NOT EXISTS ops_workspace(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)');return localDb}
function sql(){const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;if(!url)throw Error('영속 업무 저장소 설정이 필요합니다. Vercel의 Neon/Postgres 연결을 확인하세요.');return neon(url)}
let initialized:Promise<any>|undefined;
async function ready(){initialized??=sql()`CREATE TABLE IF NOT EXISTS ops_workspace (id TEXT PRIMARY KEY, payload JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;try{await initialized}catch(e){initialized=undefined;throw e}}
export const storage={
 async read(id:string){const l=local();if(l){const r=l.prepare('SELECT payload,version FROM ops_workspace WHERE id=?').get(id);return r?{state:JSON.parse(r.payload),version:r.version}:null}await ready();const rows=await sql()`SELECT payload,version FROM ops_workspace WHERE id=${id}`;return rows.length?{state:rows[0].payload as OpsState,version:Number(rows[0].version)}:null},
 async create(id:string,state:OpsState){const l=local();if(l){l.prepare('INSERT OR IGNORE INTO ops_workspace(id,payload,version,updated_at) VALUES(?,?,0,?)').run(id,JSON.stringify(state),new Date().toISOString());return}await ready();await sql()`INSERT INTO ops_workspace(id,payload,version) VALUES(${id},${JSON.stringify(state)}::jsonb,0) ON CONFLICT(id) DO NOTHING`},
 async save(id:string,state:OpsState,version:number){const l=local();if(l){const r=l.prepare('UPDATE ops_workspace SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(JSON.stringify(state),new Date().toISOString(),id,version);if(r.changes!==1)throw Error('업무가 동시 변경됐습니다.');return}await ready();const rows=await sql()`UPDATE ops_workspace SET payload=${JSON.stringify(state)}::jsonb,version=version+1,updated_at=NOW() WHERE id=${id} AND version=${version} RETURNING version`;if(rows.length!==1)throw Error('다른 작업에서 목록이 변경됐습니다. 새로고침 후 다시 확인하세요.')}
};
