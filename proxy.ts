import {NextRequest,NextResponse} from 'next/server';
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path==='/api/cron'||path==='/login'||path==='/api/login'||path.startsWith('/_next/')||path==='/favicon.svg')return NextResponse.next();
 const password=process.env.APP_PASSWORD;
 if(!password&&process.env.NODE_ENV==='production')return new NextResponse('비공개 업무 시연을 위한 APP_PASSWORD 설정이 필요합니다.',{status:503});
 if(!password)return NextResponse.next();
 const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('cheonan:'+password)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(request.cookies.get('cheonan_auth')?.value===expected)return NextResponse.next();
 if(path.startsWith('/api/'))return NextResponse.json({error:'로그인이 필요합니다.'},{status:401});
 return NextResponse.redirect(new URL('/login',request.url));
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
