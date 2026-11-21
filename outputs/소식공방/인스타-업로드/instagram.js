'use strict';
(async()=>{
  async function send(type,extra={}){
    const result=await chrome.runtime.sendMessage({type,...extra});
    if(!result?.ok)throw Error(result?.error||'소식공방 연결이 끊겼어요.');
    return result.value;
  }
  const job=await send('hello');
  if(!job)return;
  const report=(type,extra={})=>send(type,{id:job.id,...extra});
  let stopped=false,issued=false,readyBox=null,expectedHandle='',ackRatio=false;
  const root=document.createElement('div');
  root.style.cssText='position:fixed;bottom:16px;left:16px;max-width:min(430px,85vw);z-index:2147483646;pointer-events:none';
  const shadow=root.attachShadow({mode:'closed'}),hint=document.createElement('div');
  hint.style.cssText='border-radius:10px;padding:11px 16px;color:white;background:#234f43;font:600 15px/1.5 system-ui;box-shadow:0 2px 12px #0003';
  shadow.append(hint);document.body.append(root);
  function say(s){hint.textContent='소식공방 · '+s;}
  const visible=el=>!!el?.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const norm=s=>(s||'').replace(/\s+/g,' ').trim();
  const label=el=>norm(el.getAttribute('aria-label')||el.innerText||el.getAttribute('title')||el.textContent);
  function control(scope,re){
    const items=scope.querySelectorAll('button,[role="button"],a,[role="menuitem"],svg[aria-label]');
    for(const el of items){
      if(!visible(el)||el.disabled||el.getAttribute('aria-disabled')==='true')continue;
      if(re.test(label(el)))return el.closest('button,[role="button"],a,[role="menuitem"]')||el;
    }
    return null;
  }
  function dialog(){
    return [...document.querySelectorAll('[role="dialog"],dialog[open]')].reverse().find(visible);
  }
  const captionField=box=>box&&[...box.querySelectorAll('[contenteditable="true"],textarea')].find(el=>visible(el)&&/caption|문구|캡션/i.test([el.getAttribute('aria-label'),el.getAttribute('aria-placeholder'),el.getAttribute('placeholder'),el.getAttribute('data-placeholder')].join(' ')));
  const shareControl=box=>box&&control(box,/^(공유(?:하기)?|share)$/i);
  function account(box){
    const handles=new Set();
    for(const img of box.querySelectorAll('img[alt]')){
      const s=img.alt.trim();
      const m=s.match(/^([a-z0-9._]{1,30})(?:님의 프로필 (?:사진|이미지)|(?:'s|’s) profile picture)$/i);
      if(m)handles.add(m[1]);
    }
    for(const a of box.querySelectorAll('a[href]')){
      const u=new URL(a.href,location.href),m=u.pathname.match(/^\/([a-z0-9._]{1,30})\/?$/i);
      if(u.origin===location.origin&&m&&norm(a.textContent).replace(/^@/,'')===m[1])handles.add(m[1]);
    }
    return handles.size===1?[...handles][0]:'';
  }
  const readCaption=el=>(el.value??el.innerText??'').replace(/\r\n?/g,'\n').trim();
  function setCaption(el,value){
    if(readCaption(el)===value.trim())return true;
    if(readCaption(el))return false;
    el.focus();
    if(el instanceof HTMLTextAreaElement){
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }else document.execCommand('insertText',false,value);
    return readCaption(el)===value.trim();
  }
  async function waitFor(find,ms){
    const until=Date.now()+ms;
    while(!stopped&&Date.now()<until){const v=find();if(v)return v;await new Promise(r=>setTimeout(r,300));}
    return null;
  }
  function nativeShared(){
    const box=dialog();
    const nodes=[...(box?[box]:[]),...document.querySelectorAll('[role="status"],[role="alert"]')];
    const success=/^(your post has been shared|your post was shared|게시물이 공유되었습니다|게시물을 공유했습니다|게시물이 공유되었어요)[.!]?$/i;
    return nodes.find(el=>visible(el)&&!captionField(el)&&[el,...el.querySelectorAll('h1,h2,h3,span,p,[role="heading"]')].some(item=>visible(item)&&success.test(norm(item.innerText))));
  }
  let watching=false;
  async function watchResult(){
    if(watching)return;watching=true;
    const done=await waitFor(nativeShared,90000);
    if(stopped)return;
    if(done){
      const link=[...done.querySelectorAll('a[href]')].find(a=>/^\/p\/[\w-]+\/?$/.test(new URL(a.href).pathname))?.href;
      await report('complete',{link});say('게시 완료');
    }else{await report('uncertain');say('완료 표시를 확인하지 못했어요. 프로필에서 확인해 주세요.');}
  }
  document.addEventListener('click',e=>{
    const box=dialog(),share=shareControl(box);
    if(!stopped&&share&&share.contains(e.target)){
      issued=true;report('clicked').then(watchResult).catch(()=>{});
    }
  },true);
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(m.id!==job.id)return;
    if(m.type==='stop'){stopped=true;say('소식공방과의 연결을 종료했어요.');reply({});return;}
    if(m.type!=='share')return;
    const box=dialog(),field=captionField(box),button=shareControl(box);
    if(stopped||issued||!ackRatio||!expectedHandle||box!==readyBox||account(box)!==m.handle||m.handle!==expectedHandle||!button||!field||readCaption(field)!==job.caption.trim()){
      reply({clicked:false,error:'현재 계정이나 원고가 달라졌어요. Instagram 창에서 확인해 주세요.'});return;
    }
    issued=true;button.click();reply({clicked:true});watchResult().catch(()=>{});
  });
  async function manual(note){if(!stopped){say(note);await report('manual',{note});}}
  if(job.phase==='publishing'){issued=true;say('게시 결과 확인 중');await watchResult();return;}
  if(job.phase!=='waiting'){await manual('작업 화면이 다시 열렸어요. 현재 게시물을 확인하고 Instagram에서 이어가세요.');return;}
  say('학원 계정으로 로그인하면 새 게시물을 준비해요.');
  function imageInput(){
    const box=dialog();
    if(!box||!/(create new post|new post|새 게시물|게시물 만들기|사진과 동영상|drag photos)/i.test(box.innerText))return null;
    const inputs=[...document.querySelectorAll('input[type="file"]')].filter(el=>el.accept.includes('image')&&(job.count===1||el.multiple));
    return inputs.find(el=>box.contains(el))||(inputs.length===1?inputs[0]:null);
  }
  try{
    let opened=false,picked=false;
    const input=await waitFor(()=>{
      const input=imageInput();if(input)return input;
      if(dialog())return null;
      if(opened&&!picked){
        const item=control(document,/^(게시물|post)$/i);if(item){picked=true;item.click();}
      }else if(!opened){
        const create=control(document,/^(만들기|새 게시물|새로운 게시물|create|new post)$/i);
        if(create){opened=true;create.click();say('새 게시물에 카드 사진을 넣을게요.');}
      }
      return null;
    },180000);
    if(!input){await manual('Instagram에서 만들기 → 게시물을 선택해 주세요. 자동 선택이 어려우면 소식공방의 인스타용 저장으로 사진을 가져올 수 있어요.');return;}
    const payload=await report('take');
    if(!payload?.images||stopped)return;
    const dt=new DataTransfer();
    for(const [i,url] of payload.images.entries()){
      const binary=atob(url.slice(url.indexOf(',')+1)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      dt.items.add(new File([bytes],String(i+1).padStart(2,'0')+'.jpg',{type:'image/jpeg'}));
    }
    input.files=dt.files;
    if(input.files.length!==job.count)throw Error('선택한 사진 수를 확인해 주세요.');
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    const active=await report('attached');if(active?.phase!=='editing'||stopped)return;
    say('Instagram의 사진 미리보기에서 카드 순서와 세로 비율을 확인하세요.');
    let menuOpened=false,ratioChosen=false,nextAt=0;
    const field=await waitFor(()=>{
      const box=dialog();if(!box)return null;
      const field=captionField(box);if(field)return field;
      if(!ratioChosen){
        const ratio=control(box,/^(4\s*:\s*5|original|원본)$/i);
        if(ratio){ratio.click();ratioChosen=ackRatio=true;nextAt=Date.now()+700;return null;}
        const menu=control(box,/^(select crop|select aspect ratio|crop ratio|자르기 선택|자르기 비율 선택|화면 비율 선택|비율 선택)$/i);
        if(menu&&!menuOpened){menuOpened=true;menu.click();}
        if(!menu||menuOpened)say('세로 비율(4:5 또는 원본)을 고르고 다음을 누르세요. 캡션은 자동으로 채워집니다.');
        return null;
      }
      const next=control(box,/^(다음|next)$/i);
      if(next&&Date.now()>nextAt){nextAt=Date.now()+1400;next.click();}
      return null;
    },160000);
    if(!field){await manual('Instagram에서 다음을 눌러 작성 화면을 확인해 주세요. 캡션은 소식공방 게시 창에서 복사할 수 있어요.');return;}
    const box=dialog();
    if(!setCaption(field,job.caption)){await manual('캡션을 직접 확인한 후 Instagram의 공유를 누르세요.');return;}
    expectedHandle=account(box);readyBox=box;
    if(!ackRatio||!expectedHandle||!shareControl(box)){
      await manual('사진과 캡션을 넣었어요. 이 창에서 계정·사진 비율을 확인하고 Instagram의 공유를 누르세요.');return;
    }
    await report('ready',{handle:expectedHandle});
    say('소식공방에서 계정을 확인한 뒤 게시 버튼을 누르세요.');
  }catch(e){await manual('자동 준비가 중단됐어요. '+(e.message||'작성 화면을 확인해 주세요.'));}
})().catch(()=>{});
