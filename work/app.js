'use strict';
const $=id=>document.getElementById(id);
const shell='<!doctype html>\n'+document.documentElement.outerHTML;
const initial=JSON.parse($('seed').textContent);
const key='draft|'+location.pathname+'|'+(initial.instance||initial.title);
const defaults={color:'#234f43',brand:'',logo:''};
const hosted=location.protocol==='http:'&&location.hostname==='127.0.0.1'&&location.pathname==='/studio.html';
let deck,selected=0,history=[],db=null,revision=0,paintId=0,toastTimer,selectedImage='',busy=false;
const palettes=[['솔잎','#234f43'],['남색','#263e63'],['자두','#70425c'],['황토','#975633'],['라일락','#d4c8e2']];
function notice(message){
  $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').hidden=true,4500);
}
function message(e){return e.message||String(e);}
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){notice(message(e));if($('composer').open)$('dialogNotice').textContent=message(e);}};}
function cleanImage(value){
  if(!value)return '';
  if(typeof value!=='string'||value.length>2600000||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value))throw Error('PNG, JPG 또는 WebP 그림을 다시 골라 주세요.');
  return value;
}
function textField(value,max,name){
  if(value===null||value===undefined)return '';
  if(typeof value!=='string'||value.length>max)throw Error(name+'은 '+max+'자 이내로 입력해 주세요.');
  return value.replace(/\r\n?/g,'\n');
}
function validate(input){
  if(!input||typeof input!=='object'||(input.version??1)!==1||!Array.isArray(input.cards)||!input.cards.length||input.cards.length>20)throw Error('1~20장이 담긴 소식공방 초안을 선택해 주세요.');
  const color=input.color??defaults.color;
  if(!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('학원 색은 여섯 자리 색상값이어야 해요.');
  const cards=input.cards.map(c=>{
    if(!c||typeof c.title!=='string')throw Error('각 장에 제목이 있는지 확인해 주세요.');
    return {title:textField(c.title,120,'카드 제목'),body:textField(c.body,600,'본문'),photo:cleanImage(c.photo)};
  });
  return {version:1,title:textField(input.title,160,'작업 제목')||cards[0].title,topic:textField(input.topic,12000,'주제'),brand:textField(input.brand,32,'학원명'),color,logo:cleanImage(input.logo),cards};
}
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('sosigongbang-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('files');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function stored(k,value){
  return new Promise((resolve,reject)=>{
    if(!db){reject(Error('이 브라우저에서 자동 저장을 쓸 수 없어요. 편집본 저장을 눌러 주세요.'));return;}
    const write=value!==undefined,tx=db.transaction('files',write?'readwrite':'readonly'),store=tx.objectStore('files');
    const req=write?store.put(value,k):store.get(k);
    tx.oncomplete=()=>resolve(req.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('저장 공간이 부족해요.'));
  });
}
function persist(){
  const now=++revision;
  $('status').textContent='저장 중…';
  stored(key,{deck,selected}).then(()=>{if(now===revision)$('status').textContent='이 기기에 임시 저장됨';}).catch(()=>{if(now===revision)$('status').textContent='편집본을 파일로 저장해 주세요';});
}
function remember(){
  history.push({deck:structuredClone(deck),selected});
  if(history.length>14)history.shift();
  $('undo').disabled=false;
}
function role(i){return i===0?'표지':i===deck.cards.length-1?'마무리':'본문';}
function showDesign(flag){
  $('textPanel').hidden=flag;$('designPanel').hidden=!flag;
  $('tabText').setAttribute('aria-pressed',String(!flag));$('tabDesign').setAttribute('aria-pressed',String(flag));
}
function syncFields(){
  $('title').value=deck.cards[selected].title;$('body').value=deck.cards[selected].body;
  $('brandName').value=deck.brand;$('color').value=deck.color;
}
function labels(){
  $('originalText').textContent=deck.topic;$('originalNote').hidden=!deck.topic;
  $('role').textContent=(selected+1)+'장 · '+role(selected);
  $('count').textContent=deck.cards.length+'장';$('pageNum').textContent=(selected+1)+' / '+deck.cards.length;
  $('worktitle').textContent=deck.cards[0].title.replace(/\n/g,' ')||'새 카드뉴스';
  $('prev').disabled=$('up').disabled=selected===0;
  $('next').disabled=$('down').disabled=selected===deck.cards.length-1;
  $('add').disabled=deck.cards.length>=20;$('del').disabled=deck.cards.length===1;
  $('undo').disabled=!history.length;$('clearLogo').hidden=!deck.logo;$('clearPhoto').hidden=!deck.cards[selected].photo;
  $('photo').textContent=deck.cards[selected].photo?'사진 바꾸기':'＋ 사진 선택';
  $('logo').textContent=deck.logo?'로고 바꾸기':'＋ 로고 선택';
  for(const b of $('swatches').children)b.setAttribute('aria-pressed',String(b.dataset.color===deck.color.toLowerCase()));
}
function thumb(i){
  const b=document.createElement('button');b.className='thumb';b.setAttribute('aria-current',String(i===selected));b.onclick=()=>select(i);
  const cv=document.createElement('canvas');cv.width=84;cv.height=105;cv.setAttribute('aria-hidden','true');
  const wrap=document.createElement('span'),number=document.createElement('small'),name=document.createElement('strong');
  number.textContent=(i+1)+'장 · '+role(i);name.textContent=deck.cards[i].title.replace(/\n/g,' ')||'제목 입력';
  wrap.append(number,name);b.append(cv,wrap);return b;
}
async function redraw(all=true){
  const version=++paintId;labels();
  if(all){
    $('pages').replaceChildren(...deck.cards.map((c,i)=>thumb(i)));
    await Promise.all([...$('pages').children].map((b,i)=>render(b.firstChild,deck,i)));
  }else{
    const b=$('pages').children[selected];
    b.querySelector('strong').textContent=deck.cards[selected].title.replace(/\n/g,' ')||'제목 입력';
    await render(b.firstChild,deck,selected);
  }
  if(version!==paintId)return;
  const off=document.createElement('canvas');off.width=1080;off.height=1350;
  const ok=await render(off,deck,selected);if(version!==paintId)return;
  $('card').getContext('2d').drawImage(off,0,0);$('card').setAttribute('aria-label',deck.cards[selected].title+' '+deck.cards[selected].body);
  $('fit').textContent=ok?'글 길이에 맞춰 자동 배치됩니다.':'글이 넘쳐요. 새 장에 나누어 주세요.';$('fit').classList.toggle('bad',!ok);
}
function refresh(all=true){guard(redraw)(all);}
function select(i){
  if(i<0||i>=deck.cards.length)return;selected=i;syncFields();refresh();persist();
}
function change(fn,all=true){remember();fn();syncFields();refresh(all);persist();}
function setDeck(d){change(()=>{deck=d;selected=0;});showDesign(false);$('composer').close();}
function fileName(){return (deck.cards[0].title||'카드뉴스').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').trim().slice(0,45)||'카드뉴스';}
function download(blob,name){
  const a=document.createElement('a'),url=URL.createObjectURL(blob);
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function portable(){
  const snapshot={...deck,instance:crypto.randomUUID(),title:deck.cards[0].title};
  const json=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  return shell.replace(/(<script type="application\/json" id="seed">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+json+b);
}
function save(){
  download(new Blob([portable()],{type:'text/html;charset=utf-8'}),fileName()+' 편집본.html');notice('편집본을 저장했어요. 파일을 더블클릭하면 이어서 수정할 수 있어요.');
}
function caption(d){return d.cards.map(c=>[c.title.replace(/\n/g,' '),c.body].filter(Boolean).join('\n')).concat(d.brand?[d.brand]:[]).join('\n\n');}
async function exportDeck(){
  if(busy)return;busy=true;$('export').disabled=true;$('export').textContent='이미지 만드는 중…';
  const snapshot=structuredClone(deck),base=fileName();
  try{
    const zip=new JSZip(),cv=document.createElement('canvas');cv.width=1080;cv.height=1350;
    for(let i=0;i<snapshot.cards.length;i++){
      if(!snapshot.cards[i].title.trim())throw Error((i+1)+'장의 제목을 적어 주세요.');
      if(!await render(cv,snapshot,i))throw Error((i+1)+'장의 글이 넘쳐요. 문구를 줄이거나 장을 나누어 주세요.');
      const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));
      if(!blob)throw Error('이미지를 저장하지 못했어요. 다시 시도해 주세요.');
      zip.file(String(i+1).padStart(2,'0')+'.png',await blob.arrayBuffer());
    }
    zip.file('게시글.txt','\ufeff'+caption(snapshot));zip.file('편집 원본.cardnews',JSON.stringify(snapshot));
    const blob=await zip.generateAsync({type:'blob'});
    $('folder').hidden=typeof window.showDirectoryPicker!=='function';$('folder').disabled=false;$('folderStatus').textContent='';
    $('folder').onclick=async()=>{
      let parent,folder;
      try{
        parent=await window.showDirectoryPicker({mode:'readwrite',id:'sosi-pictures'});
        $('folder').disabled=true;
        const name='카드뉴스 '+base+' '+crypto.randomUUID().slice(0,8);
        folder=await parent.getDirectoryHandle(name,{create:true});
        for(const entry of Object.values(zip.files)){
          const file=await folder.getFileHandle(entry.name,{create:true});
          const stream=await file.createWritable();
          try{await stream.write(await entry.async('uint8array'));await stream.close();}
          catch(e){try{await stream.abort();}catch{}throw e;}
        }
        $('folderStatus').textContent='저장한 위치 · '+parent.name+' / '+name;
      }catch(e){
        $('folderStatus').textContent=folder?'폴더에 일부만 저장됐어요. 전체 카드는 내려받은 ZIP 파일에 있어요.':e.name==='AbortError'?'폴더 선택을 취소했어요.':'폴더에 저장할 수 없어요. 내려받은 ZIP 파일을 사용해 주세요.';
      }finally{$('folder').disabled=false;}
    };
    download(blob,base+' 인스타용.zip');$('doneInfo').textContent=snapshot.cards.length+'장의 이미지와 게시글 문구를 ZIP 파일로 저장했어요.';
    $('copyCaption').onclick=guard(async()=>{await copy(caption(snapshot));$('copyCaption').textContent='복사했어요';});
    $('copyCaption').textContent='게시글 문구 복사';$('finished').showModal();
  }finally{busy=false;$('export').disabled=false;$('export').textContent='인스타용 저장 ↓';}
}
async function copy(value){
  try{await navigator.clipboard.writeText(value);}
  catch{
    const t=document.createElement('textarea');t.value=value;(document.querySelector('dialog[open]')||document.body).append(t);t.select();
    const ok=document.execCommand('copy');t.remove();if(!ok)throw Error('복사 권한을 확인해 주세요.');
  }
}
function parseDraft(raw){
  let obj;try{obj=JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));}
  catch{throw Error('초안 전체를 복사했는지 확인해 주세요. 파일은 .cardnews 또는 JSON 형식이어야 해요.');}
  return obj;
}
async function imported(obj,applyBrand){
  const d=validate(obj);
  if(applyBrand){
    const saved=db?await stored('brand'):null;
    if(saved)for(const k of ['color','logo','brand'])if(obj[k]===undefined)d[k]=saved[k];
  }
  await Promise.all([d.logo,...d.cards.map(c=>c.photo)].filter(Boolean).map(loadImage));
  return d;
}
function parts(text){
  const result=[];
  for(let p of text.trim().split(/\n+/).map(x=>x.trim()).filter(Boolean)){
    while(p.length>148){
      let cut=Math.max(...['. ','? ','! ',' '].map(c=>p.lastIndexOf(c,145)));
      if(cut<60)cut=145;
      if(/[\uD800-\uDBFF]/.test(p[cut-1]))cut--;
      if(/[.!?]/.test(p[cut]))cut++;
      result.push(p.slice(0,cut).trim());p=p.slice(cut).trimStart();
    }
    if(p)result.push(p);
  }
  return result;
}
async function arrange(){
  const memo=$('memo').value.trim();if(!memo)throw Error('먼저 전달할 글을 적어 주세요.');
  const chunks=parts(memo);if(chunks.length>20)throw Error('20장을 넘어요. 글을 두 편으로 나누어 주세요.');
  const cards=chunks.map((p,i)=>{
    if(p.length<=34)return {title:p,body:''};
    const first=p.match(/^(.{5,34}?[.!?])\s+(.+)$/);
    return first?{title:first[1],body:first[2]}:{title:i===0?'원장님의 이야기':'이어서 전하는 말',body:p};
  });
  setDeck(await imported({cards,topic:memo},true));
}
async function imageFile(file,kind,target){
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>24e6)throw Error('24MB 이하의 PNG, JPG, WebP 사진을 골라 주세요.');
  const url=URL.createObjectURL(file),img=new Image();
  try{
    img.src=url;await img.decode();
    if(img.width*img.height>60000000)throw Error('사진 크기를 줄인 뒤 다시 골라 주세요.');
    const cv=document.createElement('canvas'),s=Math.min(1,(kind==='logo'?400:1080)/Math.max(img.width,img.height));
    cv.width=Math.max(1,Math.round(img.width*s));cv.height=Math.max(1,Math.round(img.height*s));
    const ctx=cv.getContext('2d');if(kind!=='logo'){ctx.fillStyle='white';ctx.fillRect(0,0,cv.width,cv.height);}
    ctx.drawImage(img,0,0,cv.width,cv.height);
    const data=cv.toDataURL(kind==='logo'?'image/png':'image/jpeg',.87);
    if(kind==='photo'&&!deck.cards.includes(target))return;
    change(()=>{if(kind==='logo')deck.logo=data;else target.photo=data;});
  }finally{URL.revokeObjectURL(url);}
}
let accountInfo={connected:false,sharing:false,label:'',notice:''},pendingDraft=null;
async function api(name,data={},signal){
  const response=await fetch('/api/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'연결이 끊겼어요. 다시 열어 주세요.');
  return result;
}
function accountLabels(){
  $('accountBtn').textContent=accountInfo.connected?'연결된 계정':'ChatGPT 로그인';
  $('accountState').textContent=accountInfo.connected?accountInfo.label+' · '+(accountInfo.sharing?'ChatGPT 플랜 사용 중':'플랜 사용 동의 필요'):'원장님의 ChatGPT 계정으로 연결해 주세요.';
  $('connect').hidden=accountInfo.sharing;$('disconnect').hidden=!accountInfo.connected;
  $('localDraft').textContent=accountInfo.sharing?'ChatGPT로 초안 만들기':'ChatGPT로 로그인';
  $('newHelp').textContent=accountInfo.sharing?'초안을 만들면 여기에 적은 메모가 ChatGPT로 전달돼요. 로고와 사진은 이 PC에서 편집해요.':'처음 한 번 ChatGPT에 로그인하고 플랜 사용에 동의해 주세요. 입력한 메모는 이 창에 남아 있어요.';
}
async function pollAccount(){
  accountInfo=await api('account');accountLabels();
  if(accountInfo.notice)$('accountNotice').textContent=accountInfo.notice;
}
async function signIn(){
  // Open during the click so the normal browser popup policy can allow the sign-in.
  const popup=window.open('about:blank','_blank', 'width=720,height=800');
  if(!popup)throw Error('로그인 창을 열 수 없어요. 이 편집기의 팝업을 허용한 뒤 다시 눌러 주세요.');
  popup.opener=null;
  try{
    const r=await api('signin');const target=new URL(r.url);
    if(target.origin!=='https://auth.openai.com')throw Error('로그인 주소를 확인할 수 없어요.');
    popup.location.replace(target.href);
    const msg='열린 창에서 로그인하고 ChatGPT 플랜 사용에 동의한 뒤 돌아와 주세요.';
    $('accountNotice').textContent=$('dialogNotice').textContent=msg;
    const until=Date.now()+15*60*1000;
    clearInterval(signIn.timer);
    signIn.timer=setInterval(async()=>{
      try{
        await pollAccount();
        if(accountInfo.sharing||accountInfo.notice||popup.closed||Date.now()>until){
          clearInterval(signIn.timer);
          const result=accountInfo.sharing?'연결됐어요. ‘ChatGPT로 초안 만들기’를 눌러 주세요.':accountInfo.notice||'로그인을 다시 시작할 수 있어요.';
          $('accountNotice').textContent=$('dialogNotice').textContent=result;
        }
      }catch{clearInterval(signIn.timer);}
    },1500);
  }catch(e){popup.close();throw e;}
}
function wireAccount(){
  $('accountBtn').hidden=false;$('localDraft').hidden=false;$('copyAsk').hidden=true;accountLabels();
  $('accountBtn').onclick=guard(async()=>{$('accountBox').showModal();await pollAccount();});
  $('connect').onclick=guard(signIn);
  $('disconnect').onclick=guard(async()=>{
    const result=await api('signout');await pollAccount();$('accountNotice').textContent=result.notice;
  });
  $('composer').addEventListener('close',()=>{if(pendingDraft)pendingDraft.abort();});
  $('localDraft').onclick=guard(async()=>{
    if(!accountInfo.sharing){await signIn();return;}
    const memo=$('memo').value.trim();if(!memo)throw Error('먼저 주제나 생각을 적어 주세요.');
    const controller=new AbortController();pendingDraft=controller;
    $('localDraft').disabled=$('arrange').disabled=$('importText').disabled=$('memo').disabled=true;
    $('dialogNotice').textContent='ChatGPT가 초안을 쓰고 있어요. 닫기를 누르면 취소할 수 있어요.';
    try{
      const result=await api('draft',{memo},controller.signal);
      const d=await imported(result,true);
      if(!controller.signal.aborted)setDeck(d);
    }catch(e){if(e.name==='AbortError')return;await pollAccount().catch(()=>{});throw e;}
    finally{pendingDraft=null;$('localDraft').disabled=$('arrange').disabled=$('importText').disabled=$('memo').disabled=false;}
  });
  guard(pollAccount)();
  setInterval(()=>{if(!document.hidden)pollAccount().catch(()=>{});},45000);
  window.addEventListener('focus',()=>pollAccount().catch(()=>{}));
}

function wire(){
  if(hosted)wireAccount();
  wirePublishing();
  $('tabText').onclick=()=>showDesign(false);$('tabDesign').onclick=()=>showDesign(true);
  for(const [id,field] of [['title','title'],['body','body'],['brandName','brand']]){
    const input=$(id);let before=null;
    input.onfocus=()=>before=null;
    input.oninput=()=>{
      if(!before){remember();before=true;}
      (field==='brand'?deck:deck.cards[selected])[field]=input.value;refresh(field==='brand');persist();
    };
  }
  for(const [name,color] of palettes){
    const b=document.createElement('button');b.className='swatch';b.dataset.color=color;b.title=name;
    const dot=document.createElement('i');dot.style.background=color;b.append(dot,document.createTextNode(name));
    b.onclick=()=>change(()=>deck.color=color);$('swatches').append(b);
  }
  $('color').onchange=e=>change(()=>deck.color=e.target.value);
  $('remember').onclick=guard(async()=>{await stored('brand',{brand:deck.brand,color:deck.color,logo:deck.logo});notice('다음 새 카드뉴스에도 이 디자인을 적용할게요.');});
  $('prev').onclick=()=>select(selected-1);$('next').onclick=()=>select(selected+1);
  $('add').onclick=()=>{change(()=>{deck.cards.splice(++selected,0,{title:'새 카드',body:'',photo:''});});showDesign(false);$('title').focus();$('title').select();};
  for(const [id,offset] of [['up',-1],['down',1]])$(id).onclick=()=>change(()=>{
    const to=selected+offset;deck.cards.splice(to,0,deck.cards.splice(selected,1)[0]);selected=to;
  });
  $('del').onclick=()=>change(()=>{deck.cards.splice(selected,1);selected=Math.min(selected,deck.cards.length-1);});
  $('undo').onclick=()=>{if(!history.length)return;({deck,selected}=history.pop());syncFields();refresh();persist();};
  for(const kind of ['logo','photo']){
    $(kind).onclick=()=>{selectedImage=kind;$('imageFile').click();};
    $(kind==='logo'?'clearLogo':'clearPhoto').onclick=()=>change(()=>{(kind==='logo'?deck:deck.cards[selected])[kind]='';});
  }
  $('imageFile').onchange=guard(async e=>{const file=e.target.files[0];e.target.value='';await imageFile(file,selectedImage,deck.cards[selected]);});
  document.addEventListener('paste',guard(async e=>{
    if(document.querySelector('dialog[open]'))return;
    const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));
    if(item){e.preventDefault();await imageFile(item.getAsFile(),'photo',deck.cards[selected]);}
  }));
  $('open').onclick=()=>$('projectFile').click();
  $('projectFile').onchange=guard(async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>48000000)throw Error('48MB 이하의 초안 파일을 골라 주세요.');setDeck(await imported(parseDraft(await f.text()),true));});
  $('save').onclick=guard(save);$('export').onclick=guard(exportDeck);
  $('new').onclick=()=>{$('dialogNotice').textContent='';$('composer').showModal();$('memo').focus();};
  $('arrange').onclick=guard(arrange);
  $('copyAsk').onclick=guard(async()=>{
    const memo=$('memo').value.trim();if(!memo)throw Error('먼저 주제를 적어 주세요.');
    await copy('학원 원장님의 메모로 학부모가 읽을 3~6장의 한국어 카드뉴스를 만들어 주세요. 장마다 한 가지 행동이나 생각을 담고, 주어진 사실만 사용해 주세요. 소식공방 스킬이 있으면 바로 열 수 있는 편집본을 만들어 주세요. 스킬이 없으면 다음 형식의 JSON 코드 블록 하나로 답해 주세요. {"version":1,"title":"작업 제목","cards":[{"title":"장 제목","body":"본문"}]}. 제목은 약 24자, 본문은 약 80자로 작성해 주세요.\n\n원장님 메모\n'+memo);
    $('dialogNotice').textContent='복사했어요. ChatGPT에 붙여넣은 뒤 받은 편집본을 열어 주세요. 글로 받았다면 아래에 붙여넣으세요.';
  });
  $('importText').onclick=guard(async()=>setDeck(await imported(parseDraft($('incoming').value),true)));
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}});
}
async function start(){
  deck=validate(initial);
  try{
    db=await openDB();
    const saved=await stored(key);
    if(saved){deck=await imported(saved.deck,false);selected=Math.max(0,Math.min(saved.selected||0,deck.cards.length-1));$('status').textContent='지난 작업을 불러왔어요';}
    else{
      deck=await imported(initial,true);
      $('status').textContent='편집하면 자동으로 임시 저장돼요';
    }
  }catch{$('status').textContent='편집본 저장으로 보관해 주세요';}
  wire();syncFields();await redraw();
  if(hosted&&!(db&&await stored(key)))$('new').click();
}
start().catch(e=>notice(message(e)));
