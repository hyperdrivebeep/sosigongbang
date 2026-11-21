'use strict';
function wirePublishing(){
  const id='kmcknjejiphnigaeoeeinkahnbajdojo';
  const address='http://127.0.0.1:49733/studio.html';
  const inStudio=location.origin+location.pathname===address;
  const box=$('igBox'),field=$('igCaption');
  const terminal=new Set(['cancelled','unknown','closed','error','complete']);
  let snapshot=null,job=null,previewJob='',polling=false,working=false,available=false;
  const command=()=>/^(?:(?:이거|이걸|지금\s*(?:카드|카드뉴스)|(?:방금\s*만든|이)\s*(?:카드뉴스|카드))\s*)?인스타(?:그램)?\s*에?\s*(?:올려|업로드해|게시해)\s*(?:줘|주세요|주라)?[.! ]*$/u.test($('memo').value.trim());
  async function call(type,extra={}){
    let reply;
    try{reply=await globalThis.chrome?.runtime?.sendMessage(id,{type,...extra});}catch{}
    if(!reply)throw Error('이 Chrome 프로필에서 확장 기능을 찾지 못했어요. chrome://extensions에서 ‘압축해제된 확장 프로그램을 로드’로 소식공방 폴더 안의 ‘인스타-업로드’를 선택한 뒤 편집기를 새로고침해 주세요.');
    if(!reply.ok)throw Error(reply.error);
    return reply.value;
  }
  const fail=e=>{$('igError').textContent=e?.message||'다시 시도해 주세요.';};
  const action=fn=>async()=>{if(working)return;working=true;$('igError').textContent='';try{await fn();}catch(e){fail(e);}finally{working=false;controls();}};
  function controls(){
    const active=job&&!terminal.has(job.phase);
    field.readOnly=!!active||working;
    $('igPrepare').hidden=!!active;$('igPrepare').disabled=working||(inStudio&&!available);
    $('igPrepare').textContent=inStudio?'Instagram으로 보내기':'소식공방 실행 창에서 이어가기';
    $('igShow').hidden=!job||['closed','cancelled'].includes(job.phase);
    $('igShare').hidden=job?.phase!=='ready';
    $('igShare').disabled=working;$('igShare').textContent=job?.handle?'@'+job.handle+'에 게시하기':'게시하기';
    $('igCancel').hidden=!active||job.phase==='publishing';
  }
  function update(status){
    job=status;
    if(job){
      $('igState').textContent=job.count+'장 · '+(job.handle?'@'+job.handle+' · ':'')+job.note;
      if(!terminal.has(job.phase))field.value=job.caption;
    }
    $('igPreview').hidden=!!job&&!terminal.has(job.phase)&&job.id!==previewJob;
    controls();
  }
  async function showPreview(){
    snapshot=structuredClone(deck);
    field.value=caption(snapshot);$('igPreview').replaceChildren();
    for(const [i,c] of snapshot.cards.entries()){
      const cv=document.createElement('canvas');cv.width=144;cv.height=180;
      cv.style.cssText='width:68px;height:85px;flex:none';cv.setAttribute('aria-label',(i+1)+'장 '+c.title);
      await render(cv,snapshot,i);$('igPreview').append(cv);
    }
  }
  async function open(){
    if($('composer').open)$('composer').close();
    if(!box.open)box.showModal();
    $('igError').textContent='';controls();
    previewJob='';await showPreview();
    $('igState').textContent=inStudio?snapshot.cards.length+'장을 이 순서로 준비해요. 게시할 계정은 Instagram에서 확인합니다.':'현재 편집한 카드를 이 PC의 소식공방으로 옮겨 게시할 수 있어요. 먼저 Start.cmd를 실행해 주세요.';
    if(inStudio){
      available=false;
      try{await call('ping');available=true;update(await call('status'));}
      catch(e){fail(e);}
    }
    controls();
  }
  function handoff(){
    const nonce=crypto.randomUUID(),popup=window.open(address+'#import='+nonce,'_blank');
    if(!popup)throw Error('소식공방 창을 열 수 없어요. 팝업을 허용해 주세요.');
    const timer=setTimeout(()=>{window.removeEventListener('message',receive);fail(Error('Start.cmd를 실행하고 다시 눌러 주세요.'));},18000);
    function receive(e){
      if(e.origin!==new URL(address).origin||e.source!==popup||e.data?.ready!==nonce)return;
      clearTimeout(timer);window.removeEventListener('message',receive);
      popup.postMessage({nonce,deck:snapshot,caption:field.value},e.origin);
    }
    window.addEventListener('message',receive);
  }
  $('igPrepare').onclick=action(async()=>{
    if(!inStudio){handoff();return;}
    if(Array.from(field.value).length>2200)throw Error('게시글 문구를 2,200자 이내로 줄여 주세요.');
    const cv=document.createElement('canvas');cv.width=1080;cv.height=1350;
    const images=[];controls();
    for(const [i,c] of snapshot.cards.entries()){
      if(!c.title.trim()||!await render(cv,snapshot,i))throw Error((i+1)+'장의 제목이나 글 길이를 확인해 주세요.');
      images.push(cv.toDataURL('image/jpeg',.9));
    }
    previewJob=crypto.randomUUID();
    update(await call('prepare',{id:previewJob,title:snapshot.cards[0].title,caption:field.value.trim(),images}));
  });
  $('igShare').onclick=action(async()=>update(await call('publish',{id:job.id,handle:job.handle})));
  $('igShow').onclick=action(async()=>await call('show',{id:job.id}));
  $('igCancel').onclick=action(async()=>update(await call('cancel',{id:job.id})));
  $('igCopy').onclick=action(async()=>{await copy(field.value);$('igState').textContent='게시글 문구를 복사했어요.';});
  $('instagram').onclick=action(open);
  const run=document.createElement('button');run.className='primary';run.textContent='현재 카드를 인스타에 게시';run.hidden=true;
  $('arrange').after(run);run.onclick=action(open);
  function intent(){
    const match=command();run.hidden=!match;
    $('arrange').hidden=match;$('localDraft').hidden=match||!hosted;$('copyAsk').hidden=match||hosted;
  }
  $('memo').addEventListener('input',intent);
  $('memo').addEventListener('keydown',e=>{if(!e.isComposing&&command()&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();run.click();}});
  setInterval(async()=>{
    if(working||polling||!inStudio||!available||!box.open||!job||terminal.has(job.phase))return;
    polling=true;
    try{update(await call('status'));}catch(e){fail(e);}finally{polling=false;}
  },1200);
  const nonce=new URLSearchParams(location.hash.slice(1)).get('import');
  if(inStudio&&nonce&&window.opener){
    const source=window.opener;
    const receive=async e=>{
      if(e.source!==source||e.origin!=='null'||e.data?.nonce!==nonce)return;
      window.removeEventListener('message',receive);window.history.replaceState(null,'',location.pathname);
      try{setDeck(await imported(e.data.deck,false));await open();if(!job||terminal.has(job.phase))field.value=String(e.data.caption??field.value);}
      catch(e){fail(e);}
    };
    window.addEventListener('message',receive);source.postMessage({ready:nonce},'*');
  }
}
