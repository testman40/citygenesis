import {test} from 'node:test';import assert from 'node:assert/strict';
import {compactMoney,gameDate,toolGroup} from '../src/ui/HudPresentation';

test('HUD money shortens at Japanese unit boundaries without decimals or negative zero',()=>{for(const [value,text] of [[0,'0'],[-.9,'0'],[9999.99,'9,999'],[10000,'1万'],[2819999,'281万'],[-2819999,'-281万'],[99999999,'9,999万'],[100000000,'1億'],[281999999,'2億']] as const)assert.equal(compactMoney(value),text);});
test('game calendar starts at year 1 month 1 and rolls over twelve elapsed months',()=>{assert.equal(gameDate(0),'1年1月');assert.equal(gameDate(11),'1年12月');assert.equal(gameDate(12),'2年1月');assert.equal(gameDate(1191),'100年4月');});
test('construction subtools and decorative badges use the same category palette',()=>{assert.equal(toolGroup('select'),null);for(const t of ['road','bridge','crossing'] as const)assert.equal(toolGroup(t),'road');for(const t of ['water','pipe','pipe-remove','outfall','externalWater','sewage','advancedSewage'] as const)assert.equal(toolGroup(t),'water');for(const t of ['depot','bus-stop','bus-remove'] as const)assert.equal(toolGroup(t),'transit');});
