/* ================= Platter: virtual disks of the Wang 2200 =================
   A Platter is a "disk" with a catalog of files. The 2200 called every mountable surface of a drive
   a platter (e.g. fixed/removable at address 310, 320, ...).
   This module knows nothing about the BASIC language: it only offers catalogs and data; the interpreter uses it through DiskSystem.

   File: { name, kind: 'program' | 'data', text?: string (listing), records?: any[] }
     - program: text listing (one BASIC line per line, "NNN statements")
     - data   : record data file (array of strings/numbers), used by DATA LOAD DC / DATA SAVE DC
*/
class Platter {
  constructor(label, opts={}){
    this.label=label; this.readOnly=!!opts.readOnly; this.files=new Map(); this.version=0;
  }
  addProgram(name,text){ this.files.set(name,{name,kind:'program',text}); this.version++; return this; }
  putData(name,records){ this.files.set(name,{name,kind:'data',records:records.slice(),user:true}); this.version++; }
  putProgram(name,text){ this.files.set(name,{name,kind:'program',text,user:true}); this.version++; }   // saved by the user: persists
  has(name){ return this.files.has(name); }
  get(name){ return this.files.get(name)||null; }
  remove(name){ const r=this.files.delete(name); if(r) this.version++; return r; }
  list(){ return [...this.files.values()].map(f=>({name:f.name,kind:f.kind,size:f.kind==='program'?f.text.length:f.records.length})); }
  /* serialization: read-only platters are not saved (their files come from the code) */
  toJSON(){ const o={label:this.label,files:[]}; for(const f of this.files.values()) o.files.push(f); return o; }
  static fromJSON(j){ const p=new Platter(j.label); for(const f of j.files) p.files.set(f.name,f); return p; }
}

/* DiskSystem: mounted drives + file lookup + persistence (localStorage by default).
   Addresses follow the Wang style: '310' = drive 1 (disk 0), '320', '330'... */
class DiskSystem {
  constructor(opts={}){
    this.drives=new Map();            // address -> Platter
    this.current='310';               // default drive ("SELECT DISK")
    this.prefix=opts.prefix||'wang2200';
    // localStorage may not exist or may throw (sandboxed iframe, data: URL, private mode):
    // in that case the data stays in memory only.
    let st=opts.storage;
    if(st===undefined){ try{ st = typeof localStorage!=='undefined' ? localStorage : null; if(st){ st.getItem('__t'); } }catch(e){ st=null; } }
    this.storage=st;
  }
  mount(addr,platter){ this.drives.set(addr,platter); return platter; }
  unmount(addr){ this.drives.delete(addr); }
  select(addr){ if(!this.drives.has(addr)) throw new Error('drive '+addr+' not mounted'); this.current=addr; }
  /* looks in the current drive first, then in the others */
  find(name){
    const cur=this.drives.get(this.current);
    if(cur&&cur.has(name)) return {addr:this.current,platter:cur,file:cur.get(name)};
    for(const [addr,p] of this.drives) if(p.has(name)) return {addr,platter:p,file:p.get(name)};
    return null;
  }
  status(name){ const f=this.find(name); return !f ? 0 : (f.file.kind==='program' ? 1 : 2); }
  readProgram(name){ const f=this.find(name); if(!f||f.file.kind!=='program') return null; return {text:f.file.text, version:f.platter.version, key:f.addr+':'+name}; }
  readData(name){ const f=this.find(name); return (f&&f.file.kind==='data') ? f.file.records.slice() : null; }
  writeData(name,records,addr){
    const f=this.find(name); const p= f ? f.platter : this.drives.get(addr||this.current);
    if(!p) throw new Error('no platter'); if(p.readOnly) throw new Error('platter is write-protected');
    p.putData(name,records); this.persist();
  }
  /* persistence: saves only the user-created files (user:true) of each platter */
  persist(){
    if(!this.storage) return;
    try{ for(const [addr,p] of this.drives){
      const files=[...p.files.values()].filter(f=>f.user);              // user files only: listings supplied by the code are not saved
      this.storage.setItem(this.prefix+':'+addr, JSON.stringify({label:p.label,files}));
    } }catch(e){}
  }
  /* restores the contents of the writable platters already mounted (user data saved earlier) */
  restore(){
    if(!this.storage) return;
    for(const [addr,p] of this.drives){
      try{ const j=JSON.parse(this.storage.getItem(this.prefix+':'+addr)||'null'); if(j) for(const f of j.files) if(f.user) p.files.set(f.name,f); }catch(e){}
    }
  }
  writeProgram(name,text,addr){
    const f=this.find(name); const p=f ? f.platter : this.drives.get(addr||this.current);
    if(!p) throw new Error('no platter'); if(p.readOnly) throw new Error('platter is write-protected');
    p.putProgram(name,text); this.persist();
  }
  remove(name){ const f=this.find(name); if(!f) return false; if(f.platter.readOnly) throw new Error('platter is write-protected'); f.platter.remove(name); this.persist(); return true; }
  /* exports/imports a platter as a JSON string (to download/upload "disks") */
  exportPlatter(addr){ return JSON.stringify(this.drives.get(addr).toJSON()); }
  importPlatter(addr,json){ this.mount(addr,Platter.fromJSON(JSON.parse(json))); this.persist(); }
}
if(typeof module!=='undefined') module.exports={Platter,DiskSystem};
