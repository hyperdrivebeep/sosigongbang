import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';

// Use the current Windows user's DPAPI. Data travels through stdin and stdout.
function protect(input,encrypt){
  const transform=encrypt
    ? "$b=[Text.Encoding]::UTF8.GetBytes($v);[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser'))"
    : "$b=[Convert]::FromBase64String($v);[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))";
  const command="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;$v=[Console]::In.ReadToEnd();$e=[Text.Encoding]::UTF8.GetBytes('Sosigongbang-ChatGPT-v1');"+transform;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true});
    let result='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>result+=s);
    child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',()=>reject(Error('Windows 계정 저장소를 열지 못했어요.')));
    child.on('close',code=>code===0?resolve(result.trim()):reject(Error('Windows 계정 저장소에 접근할 수 없어요.')));
    child.stdin.end(input,'utf8');
  });
}
export function createVault(directory){
  const file=path.join(directory,'connection.dpapi');let pending=Promise.resolve();
  return {
    async read(){let value;try{value=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}return JSON.parse(await protect(value,false));},
    write(value){
      const snapshot=JSON.stringify(value);
      const task=pending.then(async()=>{
        await mkdir(directory,{recursive:true});const encrypted=await protect(snapshot,true);
        await writeFile(file+'.tmp',encrypted,{mode:0o600});await rename(file+'.tmp',file);
      });
      pending=task.catch(()=>{});return task;
    }
  };
}
