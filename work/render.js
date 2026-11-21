'use strict';
const PAPER='#faf6eb', INK='#1c2924';
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
function blend(a,b,t){
  return '#'+rgb(a).map((x,i)=>Math.round(x+(rgb(b)[i]-x)*t).toString(16).padStart(2,'0')).join('');
}
function onColor(hex){
  const a=rgb(hex).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return a[0]*.2126+a[1]*.7152+a[2]*.0722>.179?'#000000':'#ffffff';
}
const imageCache=new Map();
async function loadImage(url){
  if(!url)return null;
  if(!imageCache.has(url)){
    const img=new Image();
    img.src=url;
    if(imageCache.size>45)imageCache.delete(imageCache.keys().next().value);
    imageCache.set(url,img.decode().then(()=>img).catch(()=>{imageCache.delete(url);throw Error('사진을 읽을 수 없어요. 다시 선택해 주세요.');}));
  }
  return imageCache.get(url);
}
function paintImage(g,img,x,y,w,h,crop){
  const scale=(crop?Math.max:Math.min)(w/img.width,h/img.height);
  const dw=img.width*scale,dh=img.height*scale;
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);g.restore();
}
function lines(g,s,w){
  const result=[];
  for(const para of s.replace(/\r/g,'').split('\n')){
    let line='';
    for(const word of para.trim().split(/\s+/)){
      const joined=line?line+' '+word:word;
      if(g.measureText(joined).width<=w){line=joined;continue;}
      if(line)result.push(line);
      line='';
      for(const ch of word){
        if(line && g.measureText(line+ch).width>w){result.push(line);line='';}
        line+=ch;
      }
    }
    result.push(line);
  }
  return result;
}
function fitted(g,text,color,x,y,w,h,start,min,weight,serif=false){
  if(!text)return {height:0,ok:true};
  let font=start,rows,step;
  while(true){
    g.font=weight+' '+font+'px '+(serif?'"Batang","AppleMyungjo","Noto Serif CJK KR",serif':'"Malgun Gothic","Apple SD Gothic Neo",sans-serif');
    step=font*(serif?1.31:1.45);rows=lines(g,text,w);
    if(rows.length*step<=h || font<=min)break;
    font=Math.max(min,font-2);
  }
  g.save();g.beginPath();g.rect(x-2,y,w+4,h);g.clip();g.fillStyle=color;g.textBaseline='middle';
  rows.forEach((r,i)=>g.fillText(r,x,y+(i+.5)*step));g.restore();
  return {height:Math.min(rows.length*step,h),ok:rows.length*step<=h};
}
function rule(g,color,x,y,x2,y2,width){
  g.beginPath();g.strokeStyle=color;g.lineWidth=width;g.moveTo(x,y);g.lineTo(x2,y2);g.stroke();
}
function round(g,color,x,y,w,h,r){
  g.fillStyle=color;g.beginPath();g.roundRect(x,y,w,h,r);g.fill();
}
function notebook(g,color){
  const shadow=blend(color,'#000000',.35),paper='#faf4e2',line='#bbc3b1';
  g.save();g.translate(711,967);g.rotate(-.18);
  round(g,shadow,-259,-105,545,269,14);round(g,'#dfae61',-270,-120,548,265,12);
  round(g,paper,-258,-131,524,258,13);
  rule(g,'#d6ceb9',2,-124,2,122,5);
  for(let i=0;i<5;i++){
    rule(g,line,-230,-78+i*37,-30,-78+i*37,2);
    rule(g,line,31,-78+i*37,234,-78+i*37,2);
  }
  g.fillStyle='#c9774e';g.beginPath();g.moveTo(172,-131);g.lineTo(204,-131);g.lineTo(204,-27);g.lineTo(188,-41);g.lineTo(172,-27);g.closePath();g.fill();g.restore();
  g.save();g.translate(801,985);g.rotate(-.49);
  round(g,'#d2a058',-139,-9,316,19,5);g.fillStyle='#f3ca84';g.fillRect(-139,-7,285,4);
  g.fillStyle='#dbc4a0';g.beginPath();g.moveTo(-161,0);g.lineTo(-139,-9);g.lineTo(-139,10);g.fill();
  g.fillStyle=shadow;g.beginPath();g.moveTo(-161,0);g.lineTo(-153,-3.3);g.lineTo(-153,3.5);g.fill();g.restore();
}
async function render(canvas,deck,index){
  const c=deck.cards[index],cover=index===0,end=!cover&&index===deck.cards.length-1;
  const [logo,photo]=await Promise.all([loadImage(deck.logo),loadImage(c.photo)]);
  const g=canvas.getContext('2d'),color=deck.color;
  g.save();g.setTransform(canvas.width/1080,0,0,canvas.height/1350,0,0);
  const paper=cover?color:end?blend(color,PAPER,.9):PAPER;
  const ink=cover?onColor(color):INK,stroke=blend(paper,ink,.34);
  g.fillStyle=paper;g.fillRect(0,0,1080,1350);
  const pad=78;
  const brandFit=fitted(g,deck.brand||'원장님의 교육 노트',ink,pad,62,760,68,32,18,700);
  const num=n=>String(n).padStart(2,'0');
  fitted(g,num(index+1)+' / '+num(deck.cards.length),ink,853,67,180,58,27,23,550);
  rule(g,stroke,pad,157,1002,157,2);
  const label=cover?'이번 이야기':end?'함께 해보세요':'교육 노트 '+num(index);
  const tag=cover?ink:blend(color,'#000000',.48);
  round(g,tag,pad,225,cover?211:248,68,33);
  fitted(g,label,onColor(tag),pad+31,230,206,60,30,26,650);
  const t=fitted(g,c.title,ink,75,337,928,photo?258:355,cover?109:91,40,700,cover);
  const by=337+t.height+40;
  const body=fitted(g,c.body,ink,82,by,905,(photo?861:cover?824:1142)-by,cover?44:48,34,450);
  if(photo)paintImage(g,photo,78,890,924,290,true);
  else if(cover)notebook(g,color);
  else for(let i=0;i<3;i++)rule(g,blend(paper,color,.34),844+i*37,1179,865+i*37,1145,8);
  rule(g,stroke,pad,1216,1002,1216,2);
  let bar=pad;
  if(logo){
    round(g,'#ffffff',pad,1236,177,82,9);paintImage(g,logo,pad+8,1242,161,70,false);bar+=202;
  }
  round(g,stroke,bar,1272,249,6,3);
  round(g,ink,bar,1272,249*(index+1)/deck.cards.length,6,3);
  fitted(g,cover&&deck.cards.length>1?'넘겨 보세요  →':end?'마지막 장':num(index+1)+'번째 장',ink,764,1244,253,69,29,24,550);
  g.restore();
  return brandFit.ok&&t.ok&&body.ok;
}
