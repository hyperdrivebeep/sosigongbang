'use strict';
const studio='http://127.0.0.1:49733/studio.html';
const instagram='https://www.instagram.com/';
const finished=new Set(['complete','cancelled','unknown','closed','error']);
let queue=Promise.resolve();
function serial(fn){
  const next=queue.then(fn);queue=next.catch(()=>{});return next;
}
async function media(op,value){
  const db=await new Promise((resolve,reject)=>{
    const r=indexedDB.open('current-upload',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('media');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('media',op==='get'?'readonly':'readwrite'),s=tx.objectStore('media');
    const r=op==='get'?s.get('cards'):op==='put'?s.put(value,'cards'):s.clear();
    tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
async function save(job){await chrome.storage.session.set({job});return summary(job);}
function summary(job){
  if(!job)return null;
  const {id,phase,note,handle,count,title,caption,link}=job;
  return {id,phase,note,handle,count,title,caption,link};
}
async function end(job,phase,note){
  job.phase=phase;job.note=note;await save(job);await media('clear');return summary(job);
}
async function read(){
  const {job}=await chrome.storage.session.get('job');
  if(job&&!finished.has(job.phase)&&Date.now()-job.created>25*60000){
    await end(job,job.phase==='publishing'?'unknown':'cancelled','연결 시간이 지났어요. Instagram에서 진행 상태를 확인해 주세요.');
  }
  return job;
}
async function focusTab(id){
  const tab=await chrome.tabs.update(id,{active:true});
  await chrome.windows.update(tab.windowId,{focused:true}).catch(()=>{});
}
function isStudio(sender){
  if(!sender.url||sender.frameId!==0||!sender.tab)return false;
  const u=new URL(sender.url);return u.origin+u.pathname===studio;
}
async function fromStudio(m,sender){
  if(!isStudio(sender))throw Error('설치된 소식공방에서 시작해 주세요.');
  if(m.type==='ping')return {version:1};
  const job=await read(),owner=sender.tab.id;
  if(m.type==='status')return job?.owner===owner?summary(job):null;
  if(m.type==='prepare'){
    if(job&&!finished.has(job.phase)){
      if(job.owner===owner&&job.id===m.id)return summary(job);
      throw Error('준비 중인 게시물이 있어요. 처음 작업한 소식공방 창에서 마치거나 취소해 주세요.');
    }
    if(!/^[\da-f-]{36}$/i.test(m.id)||typeof m.caption!=='string'||Array.from(m.caption).length>2200||!Array.isArray(m.images)||m.images.length<1||m.images.length>20||m.images.some(s=>typeof s!=='string'||s.length>2800000||!s.startsWith('data:image/jpeg;base64,/9j/'))||m.images.reduce((n,s)=>n+s.length,0)>38e6)throw Error('사진이나 캡션의 크기를 확인해 주세요.');
    const target=await chrome.tabs.create({url:'about:blank',active:true});
    const next={id:m.id,owner,target:target.id,count:m.images.length,title:String(m.title||'').slice(0,160),caption:m.caption,phase:'waiting',note:'Instagram에서 학원 계정에 로그인해 주세요. 로그인되어 있으면 사진을 준비합니다.',created:Date.now()};
    try{
      await media('put',m.images);await save(next);
      await chrome.tabs.update(target.id,{url:instagram});return summary(next);
    }catch(e){await end(next,'error','Instagram 창을 열지 못했어요.');throw e;}
  }
  if(!job||job.owner!==owner||m.id!==job.id)throw Error('연결된 게시물을 찾을 수 없어요.');
  if(m.type==='show'){await focusTab(job.target);return summary(job);}
  if(m.type==='cancel'&&!finished.has(job.phase)&&job.phase!=='publishing'){
    await end(job,'cancelled','소식공방의 업로드를 취소했어요.');
    await chrome.tabs.sendMessage(job.target,{type:'stop',id:job.id}).catch(()=>{});
    return summary(job);
  }
  if(m.type==='publish'){
    if(job.phase!=='ready'||!job.handle||m.handle!==job.handle)throw Error('게시 계정과 준비 상태를 다시 확인해 주세요.');
    job.phase='publishing';job.note='Instagram의 게시 결과를 기다리고 있어요.';await save(job);
    try{
      const reply=await chrome.tabs.sendMessage(job.target,{type:'share',id:job.id,handle:job.handle});
      if(!reply?.clicked)return end(job,'error',reply?.error||'Instagram 작성 화면이 바뀌었어요. 해당 창에서 확인해 주세요.');
    }catch{return end(job,'unknown','공유 결과를 확인하지 못했어요. 다시 올리기 전에 프로필을 확인해 주세요.');}
    return summary(job);
  }
  throw Error('현재 단계에서는 실행할 수 없어요.');
}
async function fromInstagram(m,sender){
  if(sender.frameId!==0||!sender.url?.startsWith(instagram))return null;
  const job=await read();
  if(!job||job.target!==sender.tab?.id||finished.has(job.phase))return null;
  if(m.type==='hello')return summary(job);
  if(m.id!==job.id)return null;
  if(m.type==='take'&&job.phase==='waiting'){
    const images=await media('get');if(!images)return end(job,'error','카드를 다시 준비해 주세요.');
    job.phase='attaching';job.note='사진을 순서대로 넣고 있어요.';await save(job);return {images,caption:job.caption};
  }
  if(m.type==='attached'&&job.phase==='attaching'){
    job.phase='editing';job.note='사진을 올렸어요. Instagram에서 미리보기를 준비하고 있어요.';await save(job);await media('clear');
  }else if(m.type==='ready'&&job.phase==='editing'&&/^[a-zA-Z0-9._]{1,30}$/.test(m.handle)){
    job.phase='ready';job.handle=m.handle;job.note='게시할 계정을 확인해 주세요.';await save(job);await focusTab(job.owner).catch(()=>{});
  }else if(m.type==='manual'&&['waiting','attaching','editing','ready'].includes(job.phase)){
    job.phase='manual';job.note=m.note.slice(0,260);await save(job);await media('clear');
  }else if(m.type==='clicked'&&['ready','manual','editing'].includes(job.phase)){
    job.phase='publishing';job.note='공유 결과를 확인하고 있어요.';await save(job);
  }else if(m.type==='complete'&&['publishing','manual','ready','editing'].includes(job.phase)){
    job.link=/^https:\/\/www\.instagram\.com\/p\/[\w-]+\/?$/.test(m.link||'')?m.link:'';
    await end(job,'complete','Instagram에서 게시 완료를 확인했어요.');
  }else if(m.type==='uncertain'&&job.phase==='publishing'){
    await end(job,'unknown','게시 완료 표시를 확인하지 못했어요. Instagram 프로필에서 확인해 주세요.');
  }
  return summary(job);
}
function listen(event,handler){
  event.addListener((msg,sender,reply)=>{
    serial(()=>handler(msg,sender)).then(value=>reply({ok:true,value}),e=>reply({ok:false,error:e.message}));
    return true;
  });
}
listen(chrome.runtime.onMessageExternal,fromStudio);
listen(chrome.runtime.onMessage,fromInstagram);
chrome.tabs.onRemoved.addListener(id=>{serial(async()=>{
  const job=await read();
  if(job&&(job.owner===id||job.target===id)&&!finished.has(job.phase)){
    await end(job,job.phase==='publishing'?'unknown':'closed','작업 창이 닫혔어요. Instagram에서 게시 상태를 확인해 주세요.');
    if(job.owner===id)await chrome.tabs.sendMessage(job.target,{type:'stop',id:job.id}).catch(()=>{});
  }
}).catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{serial(async()=>{
  if(!(await chrome.storage.session.get('job')).job)await media('clear');
}).catch(()=>{});});
