import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking --no-concurrent-recompilation --no-concurrent-marking --no-parallel-scavenge');
const { run } = await import('./solve.js');
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(I + '/cases.json', 'utf8'));
const fd = openSync(O + '/answers.json','w');
try {
  writeFileSync(fd,'[');
  for (let k=0;k<cases.length;k++) {
    const result=JSON.stringify(run(cases[k].input));
    cases[k]=null;
    writeFileSync(fd,k?','+result:result);
  }
  writeFileSync(fd,']');
} finally {closeSync(fd);}
