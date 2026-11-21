import {AppError,apiError} from './account.mjs';
export const RESPONSES_URL='https://api.openai.com/v1/responses';
/** One streamed Responses request on the learner's ChatGPT subscription; translation, tutor and chat share it. */
export function streamResponse(fetcher,{token,signal,body}){
  return fetcher(RESPONSES_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal,body:JSON.stringify({model:body.model,store:false,stream:true,...body})});
}
/** Reads a Responses event stream; onDelta receives each text fragment as it arrives. */
export async function consumeResponse(response,{onDelta}={}){
  if(!response.ok)throw await apiError(response);
  if(!response.body)throw new AppError('ChatGPT 응답 스트림이 없습니다.','missing_stream',502);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',complete=false;const eventTypes=new Set();
  function consume(block){
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;
    let event;try{event=JSON.parse(data);}catch{throw new AppError('ChatGPT 응답을 읽지 못했습니다.','invalid_stream',502);}
    if(typeof event.type==='string'&&eventTypes.size<30)eventTypes.add(event.type);
    if(event.type==='response.output_text.delta'){text+=event.delta||'';if(event.delta)onDelta?.(event.delta);}
    if(event.type==='response.completed'){
      if(event.response?.status&&event.response.status!=='completed')throw new AppError('ChatGPT 응답이 완료되지 않았습니다.','incomplete_stream',502);
      complete=true;
      const final=(event.response?.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
      if(final)text=final;
    }
    if(['response.failed','response.incomplete','error'].includes(event.type)){
      const error=event.response?.error||event.error||event;
      const code=error.code||event.type;
      throw new AppError(code==='subscription_sharing_usage_limit_exceeded'?'ChatGPT 사용 한도에 도달했습니다.  사용량 설정을 확인하세요.':code==='subscription_sharing_usage_unavailable'?'ChatGPT 사용 한도를 확인하지 못했습니다. 잠시 후 다시 시도하세요.':'ChatGPT 초안 생성이 완료되지 않았습니다. 저장된 부분부터 다시 시도하세요.',code,502,{requestId:response.headers.get('x-request-id')||null,param:error.param||null});
    }
    if(text.length>200000)throw new AppError('초안 생성 응답이 너무 깁니다.','oversized_response',502);
  }
  try{
    while(true){
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      // SSE accepts CRLF and LF; normalize only complete lines to preserve split CRLF.
      let match;while((match=/\r?\n\r?\n/.exec(buffer))){const block=buffer.slice(0,match.index).replace(/\r\n/g,'\n');buffer=buffer.slice(match.index+match[0].length);consume(block);}
      if(buffer.length>1000000)throw new AppError('ChatGPT 응답 형식을 확인하지 못했습니다.','oversized_stream',502);
      if(complete)break;
      if(done){if(buffer.trim())consume(buffer.replace(/\r\n/g,'\n'));break;}
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(!complete)throw new AppError('연결이 끊겨 초안을 저장하지 않았습니다. 다시 이어서 초안 생성하세요.','interrupted_stream',502,{requestId:response.headers.get('x-request-id')||response.headers.get('openai-request-id')||null,eventTypes:[...eventTypes],textLength:text.length});
  return text;
}
