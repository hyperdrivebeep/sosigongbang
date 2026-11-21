import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {AppError} from './account.mjs';
import {streamResponse,consumeResponse} from './responses.mjs';

const guide='학원 원장님의 메모를 학부모가 읽을 한국어 카드뉴스로 편집하세요. 메모의 핵심 생각, 날짜와 준비물을 보존하세요. 기본은 표지, 구체적 실천, 마무리까지 3~6장입니다. 지정한 장수를 지키세요. 제목 약 24자, 본문 약 80자. 확인되지 않은 학생 사례, 학원 실적, 날짜, 연락처를 만들지 마세요. 따뜻한 존댓말로 써 주세요. 답은 JSON 객체 하나로 작성하세요. 형식은 {"title":"작업 제목","cards":[{"title":"장 제목","body":"본문"}]}입니다.';
export function studioServer({auth,template,request=fetch,onActivity=()=>{}}){
  const session=randomBytes(32).toString('hex');
  let lastLogin='',generating=false;
  return http.createServer(async(req,res)=>{
    const origin='http://127.0.0.1:'+req.socket.localPort;
    const send=(status,type,content)=>{
      res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(content);
    };
    const json=(status,value)=>send(status,'application/json',JSON.stringify(value));
    if(req.headers.host!==new URL(origin).host)return json(403,{error:'주소를 확인해 주세요.'});
    const u=new URL(req.url,origin);
    try{
      if(req.method==='GET'&&u.pathname==='/app-id')return json(200,{app:'sosigongbang-signin-v1'});
      if(req.method==='GET'&&['/','/studio.html'].includes(u.pathname)){
        onActivity();
        res.setHeader('Set-Cookie','sosi_session='+session+'; Path=/; HttpOnly; SameSite=Strict');
        return send(200,'text/html',(await readFile(template,'utf8')).replace("connect-src 'none'","connect-src 'self'"));
      }
      if(req.method==='GET'&&u.pathname==='/auth/callback'){
        try{const ok=await auth.callback('director',u.searchParams);lastLogin=ok?'ChatGPT 계정을 연결했어요.':'플랜 사용에 동의하면 초안을 만들 수 있어요.';}
        catch(e){lastLogin=e instanceof AppError?e.message:'로그인을 완료하지 못했어요. 다시 연결해 주세요.';}
        res.writeHead(303,{Location:'/connected','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();
      }
      if(req.method==='GET'&&u.pathname==='/connected')return send(200,'text/html','<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>소식공방 로그인</title><body style="font:20px/1.7 Malgun Gothic,sans-serif;padding:8vw;background:#faf9f3"><h1>소식공방</h1><p>'+ (lastLogin||'로그인 창을 닫고 소식공방으로 돌아가 주세요.')+'</p><p>이 창을 닫고 편집기에서 이어가세요.</p></body></html>');
      if(!u.pathname.startsWith('/api/'))return json(404,{error:'찾을 수 없어요.'});
      const sameCookie=(req.headers.cookie||'').split(/;\s*/).includes('sosi_session='+session);
      if(!sameCookie||req.method!=='POST'||req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(403,{error:'소식공방 창에서 다시 시도해 주세요.'});
      onActivity();let length=0,buf=[];
      for await(const chunk of req){length+=chunk.length;if(length>64000)throw new AppError('메모를 줄여 주세요.','too_long',413);buf.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(buf).toString('utf8')||'{}');}catch{throw new AppError('입력 내용을 확인해 주세요.');}
      const account=auth.publicState().accounts.find(a=>a.id===auth.publicState().activeId);
      if(u.pathname==='/api/account')return json(200,{connected:!!account?.connected,sharing:!!account?.planEnabled,label:account?.connected?account.label:'',notice:lastLogin});
      if(u.pathname==='/api/signin'){
        const reconnect=account?.connected||auth.account()?.registrationPending;
        const signInUrl=await auth.start('director',origin+'/auth/callback',reconnect?auth.state.activeId:null);lastLogin='';
        return json(200,{url:signInUrl});
      }
      if(u.pathname==='/api/signout'){const status=await auth.signOut();lastLogin=status.revoked?'이 PC에서 로그아웃했어요.':'이 PC에서 로그아웃했어요. ChatGPT 설정에서 앱 연결도 확인해 주세요.';return json(200,{notice:lastLogin});}
      if(u.pathname==='/api/draft'){
        const memo=input.memo;
        if(typeof memo!=='string'||!memo.trim()||memo.length>12000)throw new AppError('전달할 생각을 1~12,000자로 적어 주세요.');
        if(generating)throw new AppError('작성 중인 초안이 있어요. 잠시 기다려 주세요.','busy',409);
        generating=true;
        const cancel=new AbortController();res.on('close',()=>cancel.abort());
        try{
          const token=await auth.token(),models=await auth.models();
          if(!models.length)throw new AppError('이 계정에서 사용할 모델을 찾지 못했어요.');
          const model=models[0].id;
          const result=await streamResponse(request,{token,signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(180000)]),body:{model,instructions:guide,input:[{role:'user',content:memo}]}});
          const text=await consumeResponse(result);
          let draft;try{draft=JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));}catch{throw new AppError('카드 문구가 올바른 형식으로 오지 않았어요. 다시 만들어 주세요.');}
          if(!Array.isArray(draft?.cards)||draft.cards.length<1||draft.cards.length>20||draft.cards.some(c=>typeof c?.title!=='string'||!c.title.trim()||c.title.length>120||typeof c.body!=='string'||c.body.length>600))throw new AppError('받은 문구의 길이나 장수가 맞지 않아요. 다시 만들어 주세요.');
          return json(200,{version:1,title:String(draft.title||draft.cards[0].title).slice(0,160),topic:memo,cards:draft.cards.map(({title,body})=>({title,body}))});
        }finally{generating=false;}
      }
      return json(404,{error:'기능을 찾지 못했어요.'});
    }catch(e){
      if(!res.destroyed&&!res.headersSent)json(e instanceof AppError?e.status:500,{error:e instanceof AppError?e.message:'연결을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요.'});
    }
  });
}
