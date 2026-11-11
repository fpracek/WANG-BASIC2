/* ================= BASIC2 Workstation: interface (screen, keyboard, disks, editor) ================= */
const SAMPLES = {
  HELLO: [
    '0010 PRINT HEX(03);"HELLO FROM BASIC2-JS"',
    '0020 FOR I=1 TO 5:PRINT "LINE";I:NEXT I',
  ],
  PRIMES: [
    '0010 REM PRIMES BELOW 100',
    '0020 FOR N=2 TO 100',
    '0030 P=1',
    '0040 FOR D=2 TO INT(SQR(N))',
    '0050 IF D<N AND MOD(N,D)=0 THEN P=0',
    '0060 NEXT D',
    '0070 IF P=1 THEN PRINT N;',
    '0080 NEXT N',
    '0090 PRINT',
  ],
  BOXES: [
    '0010 REM BOX OVERLAYS AND BLOCK GRAPHICS (ALTERNATE CHARACTER SET)',
    '0020 PRINT HEX(03060202020F);',
    '0030 FOR R=0 TO 3',
    '0040 PRINT AT(2+R*5,4+R*16);BOX(4,14);',
    '0050 PRINT AT(3+R*5,6+R*16);HEX(E8FFD4EAFFD5E8FFD4);',
    '0060 NEXT R',
    '0070 PRINT AT(22,2);"BOX AND BLOCK GRAPHICS";',
  ],
  GUESS: [
    '0010 N=INT(RND(1)*100)+1:T=0',
    '0020 PRINT "I AM THINKING OF A NUMBER FROM 1 TO 100"',
    '0030 PRINT "YOUR GUESS? ";:LINPUT G$:CONVERT G$ TO G:T=T+1',
    '0040 IF G=N THEN 90',
    '0050 IF G<N THEN PRINT "TOO LOW": ELSE PRINT "TOO HIGH"',
    '0060 GOTO 30',
    '0090 PRINT "RIGHT IN";T;"TRIES"',
  ],
};

/* ---- audio ---- */
let actx=null;
function ding(){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended') actx.resume();
    const o=actx.createOscillator(), g=actx.createGain();
    o.type='square'; o.frequency.value=1000; g.gain.setValueAtTime(0.08,actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.09);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime+0.1);
  }catch(e){}
}

/* ---- keyboard ---- */
const io={
  q:[], waiter:null,
  poll(){ return this.q.shift()||null; },
  next(){ if(this.q.length) return Promise.resolve(this.q.shift()); return new Promise(r=>{ this.waiter=r; }); },
  abort(){ if(this.waiter){ const w=this.waiter; this.waiter=null; w({c:-1,sp:true,abort:true}); } },
  push(c,sp=false){
    if(actx&&actx.state==='suspended') actx.resume();
    const k={c,sp};
    if(this.waiter){ const w=this.waiter; this.waiter=null; w(k); } else { this.q.push(k); if(this.q.length>200) this.q.shift(); }
  }
};
const SPECIAL={ArrowUp:0x46, ArrowDown:0x45, ArrowRight:0x4C, ArrowLeft:0x4D};
const typeIntoShell=s=>{ for(const ch of s) io.push(ch.charCodeAt(0)); io.push(13); };

/* ---- machine ---- */
const $=id=>document.getElementById(id);
const render=createCrtRenderer($('cv'));
const T=new Terminal(); T.onBell=ding;
const disk=new DiskSystem({prefix:'basic2ws'});
const sys=disk.mount('310', new Platter('SYSTEM'));
disk.mount('320', new Platter('USER'));
for(const n in SAMPLES) sys.addProgram(n, SAMPLES[n].join('\n')+'\n');
disk.restore();
let selDrive='310', selFile=null;
const ws=new Workstation(T, io, disk, {onChange:()=>refreshDisks()});
const SPEED={slow:2, normal:1, fast:0.4, max:0};
function setSpeed(){ const f=SPEED[$('spd').value]; ws.interp.speed=f; }
$('spd').onchange=()=>{ setSpeed(); $('spd').blur(); };
setSpeed();

window.addEventListener('keydown',e=>{
  const t=e.target; if(t && t!==$('kb') && /^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName)) return;
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  if(e.key==='Escape'){ ws.halt(); return; }
  if(SPECIAL[e.key]){ io.push(SPECIAL[e.key],true); e.preventDefault(); return; }
  if(e.key==='Enter'){ io.push(13); e.preventDefault(); return; }
  if(e.key==='Backspace'){ io.push(8); e.preventDefault(); return; }
  if(t===$('kb')) return;
  if(e.key.length===1){ io.push(e.key.charCodeAt(0)); e.preventDefault(); }
});
$('kb').addEventListener('input',()=>{ for(const ch of $('kb').value) io.push(ch.charCodeAt(0)); $('kb').value=''; });
$('cv').addEventListener('pointerdown',()=>{ if(matchMedia('(pointer:coarse)').matches) $('kb').focus(); });
$('halt').onclick=()=>ws.halt();
$('fs').onclick=()=>{ const d=document.documentElement; (document.fullscreenElement?document.exitFullscreen():d.requestFullscreen&&d.requestFullscreen()); };

/* ---- tabs ---- */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.id==='tab-'+b.dataset.tab));
});

/* ---- disks ---- */
function download(name,text,type='text/plain'){
  const bytes=new Uint8Array(text.length); for(let i=0;i<text.length;i++) bytes[i]=text.charCodeAt(i)&255;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([type==='application/json'?text:bytes],{type})); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function refreshDisks(){
  const dr=$('drive'); dr.innerHTML='';
  for(const [addr,p] of disk.drives){ const o=document.createElement('option'); o.value=addr; o.textContent=addr+'  '+p.label+(addr===disk.current?'  *':''); dr.appendChild(o); }
  if(!disk.drives.has(selDrive)) selDrive=disk.current; dr.value=selDrive;
  const box=$('files'); box.innerHTML='';
  const p=disk.drives.get(selDrive);
  const list=p?p.list().sort((a,b)=>a.name<b.name?-1:1):[];
  if(!list.length){ box.innerHTML='<div style="cursor:default;color:var(--dim)">(empty)</div>'; }
  for(const f of list){
    const d=document.createElement('div'); if(f.name===selFile) d.classList.add('sel');
    d.innerHTML='<span class="k">'+(f.kind==='program'?'PROG':'DATA')+'</span><span class="n"></span><span class="s">'+f.size+'</span>';
    d.querySelector('.n').textContent=f.name; d.onclick=()=>{ selFile=f.name; refreshDisks(); }; d.ondblclick=()=>doLoad();
    box.appendChild(d);
  }
  const f=selFile&&p?p.get(selFile):null;
  $('load').disabled=!(f&&f.kind==='program'); $('export').disabled=!(f&&f.kind==='program'); $('del').disabled=!f||p.readOnly;
}
function doLoad(){
  const p=disk.drives.get(selDrive), f=selFile&&p?p.get(selFile):null; if(!f||f.kind!=='program') return;
  if(disk.current!==selDrive){ disk.select(selDrive); }
  typeIntoShell('LOAD "'+f.name+'"');
}
$('drive').onchange=()=>{ selDrive=$('drive').value; selFile=null; refreshDisks(); };
$('selDrive').onclick=()=>{ disk.select(selDrive); refreshDisks(); };
$('load').onclick=doLoad;
$('export').onclick=()=>{ const p=disk.drives.get(selDrive), f=p.get(selFile); download(f.name+'.txt', f.text); };
$('del').onclick=()=>{ const p=disk.drives.get(selDrive); if(selFile&&confirm('Delete '+selFile+' from drive '+selDrive+'?')){ p.remove(selFile); disk.persist(); selFile=null; refreshDisks(); } };
$('newDisk').onclick=()=>{
  const label=prompt('Label for the new disk','DISK'); if(label===null) return;
  let n=330; while(disk.drives.has(String(n))) n+=10;
  disk.mount(String(n), new Platter(label.toUpperCase()||'DISK')); selDrive=String(n); refreshDisks();
};
async function readLatin1(file){ return new TextDecoder('latin1').decode(await file.arrayBuffer()); }
$('importFile').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return; const text=await readLatin1(f);
  const name=f.name.replace(/[.][^.]*$/,'').toUpperCase();
  const p=disk.drives.get(selDrive); p.putProgram(name,text); disk.persist(); selFile=name; e.target.value=''; refreshDisks();
};
$('exportDisk').onclick=()=>download('disk-'+selDrive+'.json', disk.exportPlatter(selDrive), 'application/json');
$('importDisk').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ disk.importPlatter(selDrive, await f.text()); refreshDisks(); }catch(err){ alert('Not a valid disk file: '+err.message); }
  e.target.value='';
};

/* ---- editor ---- */
const msg=t=>{ $('msg').textContent=t||''; };
$('fromProg').onclick=()=>{ $('src').value=ws.getProgramText(); msg(ws.lines.size?'':'(no program in memory)'); };
function toProgram(){
  const errs=ws.setProgramText($('src').value);
  if(errs.length){ msg(errs.slice(0,6).join('\n')); return false; }
  msg('Program updated ('+ws.lines.size+' lines).'); return true;
}
$('toProg').onclick=toProgram;
$('runProg').onclick=()=>{ if(toProgram()){ typeIntoShell('RUN'); } };

/* ---- draw loop ---- */
let blinkOn=true, lastBlink=true;
function loop(ts){
  blinkOn=Math.floor(ts/450)%2===0;
  if(T.dirty||blinkOn!==lastBlink){ T.dirty=false; lastBlink=blinkOn; render(T,blinkOn); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
refreshDisks();
ws.main();
