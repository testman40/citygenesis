import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const url=process.env.CITYGENESIS_QA_URL??'http://127.0.0.1:5180/';await fs.mkdir('work',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.setDefaultTimeout(45000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url);await p.waitForFunction(()=>document.querySelector('#save')&&!document.querySelector('#save').disabled);
 if(await p.locator('#beginner-video-welcome').isVisible()){assert.equal(await p.locator('#beginner-support-from-video').isVisible(),true);await p.locator('#beginner-video-welcome button').first().click();}
 await p.locator('#beginner-support-welcome').waitFor({state:'visible'});await p.screenshot({path:`work/support-welcome-${width}.png`});
 const snapshot=()=>p.evaluate(()=>window.cityDiagnostics?.saveSnapshot());const initial=await snapshot();
 await p.locator('#support-introduction-open').click();await p.locator('#support-mode').waitFor({state:'visible'});assert.equal(await p.locator('#support-mode').inputValue(),'off');assert.match(await p.locator('#support-mode-help').innerText(),/停止中/);assert.equal(await p.locator('#support-apply').isVisible(),false);
 if(initial)assert.deepEqual((await snapshot()).city,initial.city,'opening introduction never builds');
 await p.locator('#support-mode').selectOption('advice');await p.waitForFunction(()=>document.querySelector('#support-mode-help').textContent.startsWith('案内のみ'));assert.equal(await p.locator('#support-apply').isVisible(),false);assert.match(await p.locator('#support-proposal').innerText(),/道路|給水/);
 await p.locator('#support-mode').selectOption('approve');await p.locator('#support-apply').waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('#support-apply').disabled);await p.screenshot({path:`work/support-settings-${width}.png`});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
 await p.locator('#support-apply').click();await p.waitForFunction(()=>document.querySelector('#support-history').textContent.includes('承認'));if(initial){const after=await snapshot();assert.ok(after.city.funds<initial.city.funds);assert.equal(after.city.support.history.length,1);assert.equal(after.clock.speed,0);}
 if(width===1440&&initial){
  await p.locator('#support-mode').selectOption('auto');await p.waitForFunction(()=>document.querySelector('#support-mode-help').textContent.startsWith('自動サポート'));
  await p.waitForTimeout(650);if(initial)assert.equal((await snapshot()).city.support.history.length,1,'paused support never constructs');
  await p.locator('[data-speed="1"]').click();await p.waitForTimeout(800);if(initial)assert.equal((await snapshot()).city.support.history.length,1,'open help never constructs');
  await p.locator('#workspace-close').click();await p.waitForFunction(()=>window.cityDiagnostics?.saveSnapshot().city.support.history.length>=2);await p.locator('[data-speed="0"]').click();
  await p.locator('#hud-settings').click();await p.locator('#beginner-support-open').click();await p.locator('#support-mode').waitFor({state:'visible'});assert.match(await p.locator('#support-history').innerText(),/自動/);
 }
 await p.locator('#support-stop').click();await p.waitForFunction(()=>document.querySelector('#support-mode').value==='off');assert.match(await p.locator('#support-mode-help').innerText(),/停止中/);
 await p.locator('#workspace-close').click();await p.locator('#hud-settings').click();await p.locator('#beginner-support-open').click();await p.locator('#support-mode').waitFor({state:'visible'});assert.equal(await p.locator('#support-mode').inputValue(),'off');
 await p.locator('#workspace-close').click();await p.locator('#hud-settings').click();await p.locator('#hud-settings-menu [data-workspace="save"]').click();await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('手動保存済')&&!document.querySelector('#save').disabled);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#save')&&!document.querySelector('#save').disabled);assert.equal(await p.locator('#beginner-support-welcome').isVisible(),false,'introduction is acknowledged');await p.locator('#hud-settings').click();await p.locator('#beginner-support-open').click();await p.locator('#support-mode').waitFor({state:'visible'});assert.match(await p.locator('#support-history').innerText(),/承認/);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);assert.deepEqual(errors,[]);console.log('PASS',width,'intro, modes, approval, stop, settings re-entry, save/reload, no overflow/errors');await context.close();
}
}finally{await browser.close();}
