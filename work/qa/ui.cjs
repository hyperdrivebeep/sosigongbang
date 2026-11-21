const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const JSZip=require('jszip');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs','소식공방'),qa=__dirname;
const url=p=>pathToFileURL(p).href;
const pngSize=b=>[b.readUInt32BE(16),b.readUInt32BE(20)];
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.SOSI_BROWSER||path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe')});
try{
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
async function ready(){await page.locator('.thumb').first().waitFor();await page.waitForFunction(()=>document.querySelector('#fit').textContent.length>0);}
async function open(p){await page.goto(url(p));await ready();}
async function download(button,file){const event=page.waitForEvent('download');await page.locator(button).click();const d=await event;await d.saveAs(file);}
await open(path.join(out,'소식공방.html'));assert.equal(await page.locator('.thumb').count(),4);
await page.screenshot({path:path.join(qa,'editor.png'),fullPage:true});
const zipFile=path.join(qa,'오답노트 인스타용.zip');
await download('#export',zipFile);await page.locator('#finished button').first().click();
const zip=await JSZip.loadAsync(fs.readFileSync(zipFile));
for(const name of ['01.png','02.png','03.png','04.png'])assert.deepEqual(pngSize(await zip.file(name).async('nodebuffer')),[1080,1350]);
assert.equal(await zip.file('게시글.txt').async('string').then(v=>v.includes('분모')),true);
const original=JSON.parse(await zip.file('편집 원본.cardnews').async('string'));assert.equal(original.cards.length,4);
console.log('PASS sample export, four independently readable PNG headers, caption and source');
await page.locator('#next').click();await page.locator('#title').fill('수정한 제목');await page.locator('#body').fill('다시 열어도 보이는 본문이에요.');
await page.locator('#tabDesign').click();await page.locator('#brandName').fill('QA 학원');await page.getByRole('button',{name:'자두',exact:true}).click();
const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=100;const g=c.getContext('2d');g.fillStyle='#d70085';g.fillRect(0,0,300,100);return c.toDataURL().split(',')[1];});
const f={name:'logo.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')};
let chooser=page.waitForEvent('filechooser');await page.locator('#logo').click();await (await chooser).setFiles(f);
await page.waitForFunction(()=>!document.querySelector('#clearLogo').hidden);
await page.locator('#remember').click();await page.locator('#tabText').click();
chooser=page.waitForEvent('filechooser');await page.locator('#photo').click();await (await chooser).setFiles(f);
await page.waitForFunction(()=>!document.querySelector('#clearPhoto').hidden);
await page.locator('#add').click();await page.locator('#title').fill('추가 카드');await page.locator('#up').click();assert.equal(await page.locator('#pageNum').innerText(),'2 / 5');
await page.locator('#del').click();assert.equal(await page.locator('.thumb').count(),4);await page.locator('#undo').click();assert.equal(await page.locator('#title').inputValue(),'추가 카드');
await page.locator('#down').click();await page.locator('#prev').click();assert.equal(await page.locator('#title').inputValue(),'수정한 제목');
const edited=path.join(qa,'edited.zip');await download('#export',edited);await page.locator('#finished button').first().click();
const editedZip=await JSZip.loadAsync(fs.readFileSync(edited)),data=JSON.parse(await editedZip.file('편집 원본.cardnews').async('string'));
assert.equal(data.color,'#70425c');assert.equal(data.brand,'QA 학원');assert.ok(data.logo);assert.ok(data.cards[1].photo);assert.equal(data.cards[1].body,'다시 열어도 보이는 본문이에요.');
fs.writeFileSync(path.join(qa,'edited.png'),await editedZip.file('02.png').async('nodebuffer'));
const saved=path.join(qa,'수정본.html');await download('#save',saved);
await page.reload();await ready();assert.equal(await page.locator('#title').inputValue(),'수정한 제목');
await open(saved);assert.equal(await page.locator('.thumb').count(),5);await page.locator('#next').click();assert.equal(await page.locator('#body').inputValue(),data.cards[1].body);
console.log('PASS edits, logo, photo, palette, brand defaults, movement, deletion, undo, reload and portable HTML');
await page.locator('#body').fill(Array(55).fill('여러 줄').join('\n'));await page.locator('#fit.bad').waitFor();await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('넘쳐요'));
await page.locator('#new').click();await page.locator('#memo').fill('겨울방학 독서 모임\n토요일에는 읽고 싶은 책 한 권을 가방에 넣어 주세요.\n노란색 독서 기록장도 함께 준비해 주세요.');
await page.locator('#arrange').click();await page.locator('#composer').waitFor({state:'hidden'});assert.equal(await page.locator('.thumb').count(),3);
await page.locator('#tabDesign').click();assert.equal(await page.locator('#brandName').inputValue(),'QA 학원');
await page.locator('#new').click();await page.locator('#composer summary').click();await page.locator('#incoming').fill('{"cards":[]}');await page.locator('#importText').click();await page.waitForFunction(()=>document.querySelector('#dialogNotice').textContent.includes('20장'));assert.equal(await page.locator('.thumb').count(),3);
await page.locator('#incoming').fill(JSON.stringify({cards:[{title:'</script> 안전한 제목',body:'한 장 카드'}]}));await page.locator('#importText').click();await page.locator('#tabText').click();assert.equal(await page.locator('#title').inputValue(),'</script> 안전한 제목');
const safe=path.join(qa,'escaped.html');await download('#save',safe);await open(safe);assert.equal(await page.locator('#title').inputValue(),'</script> 안전한 제목');
await page.locator('#projectFile').setInputFiles({name:'초안.cardnews',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
await page.waitForFunction(()=>document.querySelectorAll('.thumb').length===4);
console.log('PASS overflow prevented, offline paragraph layout, malformed input preserved work, single card and special characters');
await open(path.join(out,'예시','시험 전날 편집본.html'));assert.equal(await page.locator('.thumb').count(),3);
const aiZip=path.join(qa,'ai.zip');await download('#export',aiZip);const aiData=await JSZip.loadAsync(fs.readFileSync(aiZip)),cap=await aiData.file('게시글.txt').async('string');assert.match(cap,/시험 전날/);assert.match(cap,/문제/);
await page.locator('#finished button').first().click();
await page.setViewportSize({width:390,height:844});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(qa,'mobile.png'),fullPage:true});
assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('PASS live ChatGPT draft to PNG, mobile width, zero runtime errors and zero HTTP requests by editor');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
