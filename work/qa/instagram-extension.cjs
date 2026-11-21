const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs','소식공방');
const ext=path.join(out,'인스타-업로드'),studio='http://127.0.0.1:49733/studio.html';
const html=fs.readFileSync(path.join(out,'소식공방.html'),'utf8').replace("connect-src 'none'","connect-src 'self'");
const fixture='<!doctype html><html lang="ko"><body><button id="create">만들기</button><div id="host"></div><script> </script></body></html>';
const script=()=>{
 const host=document.querySelector('#host'),create=document.querySelector('#create');
 window.fileList=[];window.shareCount=0;window.ratio='';
 create.onclick=()=>{
   host.innerHTML='<section role="dialog">새 게시물 만들기<input type="file" multiple accept="image/jpeg,image/png"></section>';
   host.querySelector('input').onchange=async e=>{
     window.fileList=await Promise.all([...e.target.files].map(async f=>{const b=await createImageBitmap(f);return [f.name,b.width,b.height,f.type];}));
     host.innerHTML='<section role="dialog"><button aria-label="Select crop">자르기</button><button>다음</button></section>';
     host.querySelector('[aria-label]').onclick=e=>{
       e.target.outerHTML='<button id="ratio">4:5</button>';host.querySelector('#ratio').onclick=()=>{window.ratio='4:5';};
     };
     host.querySelector('button:last-child').onclick=()=>{
       host.innerHTML='<section role="dialog"><img alt="example.academy님의 프로필 사진"><textarea aria-label="문구 입력..."></textarea><button>공유</button></section>';
       host.querySelector('button').onclick=()=>{window.shareCount++;host.innerHTML='<section role="dialog"><h2>게시물이 공유되었습니다</h2></section>';};
     };
   };
 };
};
(async()=>{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sosi-extension-check-'));
const ctx=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.SOSI_BROWSER||path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe'),args:['--enable-unsafe-extension-debugging'],ignoreDefaultArgs:['--disable-extensions']});
const errors=[];
ctx.on('page',p=>p.on('pageerror',e=>errors.push(String(e))));
try{
 const dev=await ctx.browser().newBrowserCDPSession();
 const loaded=await dev.send('Extensions.loadUnpacked',{path:ext});assert.equal(loaded.id,'kmcknjejiphnigaeoeeinkahnbajdojo');
 await ctx.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.href===studio)return r.fulfill({contentType:'text/html; charset=utf-8',body:html});
   if(u.origin===new URL(studio).origin&&u.pathname==='/api/account')return r.fulfill({json:{connected:false,sharing:false}});
   if(u.hostname==='www.instagram.com')return r.fulfill({contentType:'text/html; charset=utf-8',body:fixture.replace('<script> </script>','<script>('+script.toString()+')()</script>')});
   return r.abort();
 });
 const p=await ctx.newPage();await p.goto(studio);await p.locator('#composer[open]').waitFor();
 await p.locator('#memo').fill('인스타에 올려줘');await p.locator('#memo').press('Enter');await p.locator('#igBox[open]').waitFor();
 await p.waitForFunction(()=>!document.querySelector('#igPrepare').disabled);
 const count=await p.locator('#igPreview canvas').count();assert.equal(count,4);
 await p.locator('#igCaption').fill('가'.repeat(2201));await p.locator('#igPrepare').click();await p.getByText('게시글 문구를 2,200자 이내로 줄여 주세요.').waitFor();
 async function prepare(){
   const event=ctx.waitForEvent('page');
   await p.locator('#igCaption').fill('아이와 함께 오답 하나를 다시 봐요.');
   await p.locator('#igPrepare').click();const ig=await event;
   await p.locator('#igShare:visible').waitFor({timeout:18000});
   assert.equal(await ig.locator('textarea').inputValue(),'아이와 함께 오답 하나를 다시 봐요.');
   assert.deepEqual(await ig.evaluate(()=>window.fileList),Array.from({length:count},(_,i)=>[String(i+1).padStart(2,'0')+'.jpg',1080,1350,'image/jpeg']));
   assert.equal(await ig.evaluate(()=>window.ratio),'4:5');assert.equal(await ig.evaluate(()=>window.shareCount),0);
   return ig;
 }
 const one=await prepare();await p.locator('#igCancel').click();await p.getByText(/소식공방의 업로드를 취소했어요/).waitFor();
 assert.equal(await one.evaluate(()=>window.shareCount),0);
 const two=await prepare();await two.locator('img').evaluate(el=>el.alt='other.account님의 프로필 사진');await p.locator('#igShare').click();
 await p.getByText(/현재 계정이나 원고가 달라졌어요/).waitFor();assert.equal(await two.evaluate(()=>window.shareCount),0);
 const three=await prepare();
 await p.screenshot({path:path.join(__dirname,'ig-ready.png')});
 await p.locator('#igShare').click();
 await p.getByText(/Instagram에서 게시 완료를 확인했어요/).waitFor({timeout:12000});
 assert.equal(await three.evaluate(()=>window.shareCount),1);assert.equal(await p.locator('#igShare').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS unpacked MV3, editor intent, caption length, ordered JPEGs, native 4:5, caption fill, account change, cancel, explicit publish exactly once and confirmation (fixture).');
}finally{await ctx.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
