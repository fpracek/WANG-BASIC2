// LOAD T"name" from,to BEG line: overlay of a line range, execution continues at BEG
const { Interp } = require('../src/basic2.js');
const { Platter, DiskSystem } = require('../src/platter.js'), { Terminal } = require('../src/wangcrt.js');
let fail = 0; const expect = (n, c) => { console.log((c ? '  ok  ' : 'FAIL  ') + n); if (!c) fail++; };
(async () => {
  const disk = new DiskSystem({ storage: null }); const pl = new Platter('S'); disk.mount('310', pl);
  pl.putProgram('OVL', '10 PRINT "NEW10"\n20 PRINT "NEW20"\n30 PRINT "NEW30"\n40 END\n');
  const T = new Terminal(); const io = { next: () => new Promise(() => {}), poll: () => null };
  const it = new Interp(T, io, disk); it.reportErrors = false; it.returnErrors = true; it.setDialect('niakwa-2c');
  it.setProgram([{ no: 5, src: 'PRINT "KEEP"' }, { no: 100, src: 'LOAD T"OVL"10,40 BEG 20' }, { no: 200, src: 'PRINT "TAIL"' }]);
  const res = await it.runFrom(null);
  let s = ''; for (let r = 0; r < 6; r++) { for (let c = 0; c < 20; c++) { const b = T.ch[r * 80 + c]; s += String.fromCharCode(b < 32 ? 32 : b); } s += '|'; }
  expect('overlay replaces the range and starts at BEG', /NEW20/.test(s) && /NEW30/.test(s) && !/NEW10/.test(s) && !/TAIL/.test(s));
  console.log(s, res && res.status);
  process.exit(fail ? 1 : 0);
})();
