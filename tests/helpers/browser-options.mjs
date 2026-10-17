import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const QA_WORK_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','work');

function assertFreshQaRoot(qaRoot){
  const relative=path.relative(QA_WORK_ROOT,qaRoot);
  if(!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw new Error('QA root must be inside the working copy work directory');
  // Inspect existing ancestors without following links or creating any files.
  let current=qaRoot;
  for(;;){
    let item;
    try{item=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(item&&(item.isSymbolicLink()||!item.isDirectory()))throw new Error('QA path must use ordinary directories');
    if(current===path.dirname(current))break;
    current=path.dirname(current);
  }
  try{fs.lstatSync(path.join(qaRoot,'profile'));throw new Error('QA profile already exists; reuse is prohibited');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}

/** Options only: does not launch a process or create a profile. */
export function isolatedEdgeOptions(qaRoot) {
  if (!path.isAbsolute(qaRoot)) throw new Error('QA root must be absolute');
  qaRoot=path.resolve(qaRoot);
  assertFreshQaRoot(qaRoot);
  const profile = path.join(qaRoot, 'profile');
  const artifacts = path.join(qaRoot, 'artifacts');
  const temporary = path.join(qaRoot, 'tmp');
  return {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    chromiumSandbox: true,
    ignoreDefaultArgs: true,
    timeout: 15000,
    artifactsDir: artifacts,
    downloadsPath: artifacts,
    env: {...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary},
    args: [
      '--headless',
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      // ignoreDefaultArgs also removes Playwright's generated profile argument.
      // Pass this explicitly even when launchPersistentContext receives a path.
      '--user-data-dir=' + profile,
      '--disk-cache-dir=' + path.join(profile, 'cache'),
      '--crash-dumps-dir=' + path.join(profile, 'crashes'),
    ],
  };
}
