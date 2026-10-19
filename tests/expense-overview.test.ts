import {test} from 'node:test';import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';import {expenseOverview,additionalFacilityBalance} from '../src/economy/ExpenseOverview';import {facilityEconomics} from '../src/economy/FacilityEconomics';
test('the overview includes roads and facilities and does not alter financial state',()=>{
 const c=City.create(64);c.funds=1e6;c.apply({x:0,z:30},{x:30,z:30},'road');c.apply({x:10,z:29},{x:10,z:29},'police');const before=c.snapshot(),o=expenseOverview(c),f=c.finance().forecast;
 assert.equal(o.income,f.tax);assert.equal(o.expense,f.maintenance);assert.equal(o.balance,f.balance);assert.ok(o.expense>o.facilityExpense);assert.equal(o.status,'赤字');assert.match(o.advice,/改善/);assert.deepEqual(c.snapshot(),before);
});
test('a second facility estimate applies only the additional expense, never an existing expense twice',()=>{
 assert.equal(additionalFacilityBalance(20,{income:0,cost:16}),4);assert.equal(additionalFacilityBalance(10,{income:0,cost:16}),-6);assert.equal(additionalFacilityBalance(-10,{income:0,cost:16}),-26);assert.equal(additionalFacilityBalance(10,{income:2,cost:3}),9);
});
test('positive income distinguishes a narrow surplus from a deficit without guessing tax attribution',()=>{
 const c=City.create(64);c.apply({x:0,z:30},{x:40,z:30},'road');c.apply({x:10,z:31},{x:15,z:31},'residential');c.apply({x:25,z:29},{x:30,z:29},'industrial');for(let i=0;i<14;i++)c.step();let o=expenseOverview(c);assert.equal(o.previousBalance,c.finance().previous!.balance);assert.ok(o.income>0);assert.ok(o.balance>0);assert.equal(o.status,'黒字');
 const rows=facilityEconomics(c);assert.ok(rows.every(r=>r.income===0));const forecast=c.finance().forecast;const facade={finance:()=>({forecast:{...forecast,maintenance:95,tax:100,balance:5}})} as City;o=expenseOverview(facade,[]);assert.equal(o.status,'黒字・余裕少');assert.match(o.advice,/90%/);
});
