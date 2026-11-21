import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ChatGPTAuth} from '../../outputs/소식공방/app/account.mjs';
import {studioServer} from '../../outputs/소식공방/app/service.mjs';
import {createVault} from '../../outputs/소식공방/app/vault.mjs';
import {generateKeyPair,exportJWK,createLocalJWKSet,jwtVerify,SignJWT} from '../../outputs/소식공방/app/vendor/jose/dist/webapi/index.js';
const dir=await mkdtemp(path.join(path.dirname(fileURLToPath(import.meta.url)),'fixture-'));
const vault=createVault(dir),pair=await generateKeyPair('RS256');
const jwk=await exportJWK(pair.publicKey);jwk.kid='fixture';
const keys=createLocalJWKSet({keys:[jwk]});
let nonce='',access='only-test-value',plan=true,grants=0,revoked=false;
const auth=new ChatGPTAuth({vault,verifyIdentity:(token,id)=>jwtVerify(token,keys,{issuer:'https://auth.openai.com',audience:id}),fetcher:async(url,opts)=>{
  if(url.endsWith('/oauth/token')){
    grants++;assert.ok(opts.body.get('client_id')==='oaiapp_fixture');
    const jwt=await new SignJWT({sub:'fixture',nonce,email:'sosi@example.invalid'}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuedAt().setExpirationTime('1h').setIssuer('https://auth.openai.com').setAudience('oaiapp_fixture').sign(pair.privateKey);
    return Response.json({id_token:jwt,access_token:access,refresh_token:'only-test-refresh',expires_in:3600,token_type:'Bearer',scope:plan?'openid chatgpt.tokens.use.direct':'openid'});
  }
  if(url.endsWith('/models'))return Response.json({models:[{slug:'fixture-model',visibility:'list'}]});
  if(url.endsWith('/revoke')){revoked=true;return new Response(null,{status:200});}
  throw Error('Unexpected request');
}});
await auth.init();
const sample={title:'한 쪽부터',cards:[{title:'한 쪽 소리 내어 읽기',body:'오늘 읽고 싶은 책을 골라 보세요.'}]};
const srv=studioServer({auth,template:new URL('../../outputs/소식공방/소식공방.html',import.meta.url),request:async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opts.headers.Authorization,'Bearer '+access);
  const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.input[0].content,'하루 한 쪽 독서');
  return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(sample)})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n');
}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+srv.address().port;
try{
const page=await fetch(origin+'/studio.html');const cookie=page.headers.get('set-cookie').split(';')[0];
const post=(route,obj={})=>fetch(origin+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(obj)});
assert.equal((await (await post('account')).json()).connected,false);
assert.equal((await post('draft',{memo:'하루 한 쪽 독서'})).status,401);
async function login(){
  const {url}=await (await post('signin')).json(),u=new URL(url);nonce=u.searchParams.get('nonce');assert.equal(u.origin,'https://auth.openai.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  const cb=new URL(u.searchParams.get('redirect_uri'));cb.search=new URLSearchParams({code:'only-test-code',state:u.searchParams.get('state'),client_id:'oaiapp_fixture'});
  assert.equal((await fetch(cb,{redirect:'manual'})).status,303);
}
plan=false;await login();assert.equal((await (await post('account')).json()).sharing,false);assert.equal((await post('draft',{memo:'하루 한 쪽 독서'})).status,403);
plan=true;await login();const info=await (await post('account')).json();assert.ok(info.sharing);assert.ok(!JSON.stringify(info).includes(access));
const made=await (await post('draft',{memo:'하루 한 쪽 독서'})).json();assert.deepEqual(made.cards,sample.cards);assert.equal(made.topic,'하루 한 쪽 독서');
const onDisk=await readFile(path.join(dir,'connection.dpapi'),'utf8');assert.ok(!onDisk.includes(access));assert.equal((await createVault(dir).read()).accounts[0].access_token,access);
await post('signout');assert.ok(revoked);assert.equal((await (await post('account')).json()).connected,false);assert.equal(grants,2);
console.log('PASS disconnected, identity without plan, consent, signed identity, model discovery, completed Responses, DPAPI reopen, logout.');
}finally{await new Promise(r=>srv.close(r));}
