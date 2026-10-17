import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {isolatedEdgeOptions,QA_WORK_ROOT} from './helpers/browser-options.mjs';

const qaRoot = path.resolve('work', 'browser-options-fixture');

test('QA Edge explicitly selects its profile when default arguments are disabled', () => {
  const options = isolatedEdgeOptions(qaRoot);
  assert.equal(options.ignoreDefaultArgs, true);
  assert.deepEqual(options.args.filter(a => a.startsWith('--user-data-dir=')), [
    '--user-data-dir=' + path.join(qaRoot, 'profile'),
  ]);
});

test('QA Edge retains sandbox and does not request protection bypass flags', () => {
  const options = isolatedEdgeOptions(qaRoot);
  assert.equal(options.chromiumSandbox, true);
  assert.ok(!options.args.some(a => /^--(?:no-sandbox|disable-gpu-sandbox|ignore-certificate-errors)(?:=|$)/.test(a)));
  assert.ok(options.args.includes('--disable-background-networking'));
  assert.ok(options.args.includes('--disable-sync'));
});

test('QA Edge output and temporary paths stay under the supplied QA root', () => {
  const options = isolatedEdgeOptions(qaRoot);
  const outputs = [options.artifactsDir, options.downloadsPath,
    options.env.TEMP, options.env.TMP, options.env.TMPDIR,
    ...options.args.filter(a => /^--(?:user-data-dir|disk-cache-dir|crash-dumps-dir)=/.test(a)).map(a => a.slice(a.indexOf('=') + 1))];
  for (const output of outputs) {
    const relative = path.relative(qaRoot, output);
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  }
});

test('QA Edge options reject a relative QA root without launching anything', () => {
  assert.throws(() => isolatedEdgeOptions('relative-profile'), /absolute/);
});

test('QA Edge rejects roots outside this working copy work directory',()=>{
  assert.throws(()=>isolatedEdgeOptions(path.resolve('..','outside-qa')),/inside/);
  assert.throws(()=>isolatedEdgeOptions(QA_WORK_ROOT),/inside/);
});

test('QA Edge rejects an existing profile without modifying its marker',()=>{
  const root=fs.mkdtempSync(path.join(QA_WORK_ROOT,'browser-options-check-'));
  fs.mkdirSync(path.join(root,'profile'));
  const marker=path.join(root,'profile','qa-marker.txt');fs.writeFileSync(marker,'preserve',{flag:'wx'});
  assert.throws(()=>isolatedEdgeOptions(root),/already exists/);
  assert.equal(fs.readFileSync(marker,'utf8'),'preserve');
});
