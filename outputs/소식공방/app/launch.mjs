import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createVault} from './vault.mjs';
import {ChatGPTAuth} from './account.mjs';
import {studioServer} from './service.mjs';
const port=49733, url='http://127.0.0.1:'+port;
function openEditor(){
  const roots=[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean);
  const browser=['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'].flatMap(name=>roots.map(root=>path.join(root,name))).find(existsSync);
  const child=browser?spawn(browser,['--app='+url+'/studio.html'],{detached:true,stdio:'ignore'}):spawn('rundll32.exe',['url.dll,FileProtocolHandler',url+'/studio.html'],{detached:true,stdio:'ignore'});
  child.unref();
}
async function main(){
  try{
    const check=await fetch(url+'/app-id',{signal:AbortSignal.timeout(700)});
    if((await check.json()).app==='sosigongbang-signin-v1'){openEditor();return;}
  }catch{}
  const auth=new ChatGPTAuth({vault:createVault(path.join(process.env.LOCALAPPDATA,'Sosigongbang','ChatGPT'))});
  let active=Date.now();
  const server=studioServer({auth,template:fileURLToPath(new URL('../소식공방.html',import.meta.url)),onActivity:()=>active=Date.now()});
  // Bind before loading the vault so two simultaneous launches never initialize it twice.
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  try{await auth.init();}catch(e){server.close();throw e;}
  openEditor();
  const idle=setInterval(()=>{if(Date.now()-active>16*60*1000){clearInterval(idle);server.close();}},30000);idle.unref();
}
main().catch(()=>{
  const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Windows.Forms;[void][Windows.Forms.MessageBox]::Show('편집기를 열 수 없어요. 열려 있는 소식공방을 확인하거나 소식공방.html을 열어 주세요.','소식공방')"],{windowsHide:true,stdio:'ignore'});p.unref();
});
