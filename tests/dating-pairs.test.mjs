import test from 'node:test';
import assert from 'node:assert/strict';
import {pairRound,pairKey} from '../lib/dating-pairs.mjs';
const p=(uid,gender,extra={})=>({uid,gender,ev:'A',age:30,min_age:18,max_age:99,genders:['femme','homme'],...extra});
test('maximum matching avoids the greedy trap and honors mutual preferences',()=>{
 const people=[p('a','femme',{genders:['homme']}),p('b','femme',{genders:['homme']}),p('c','homme',{genders:['femme']}),p('d','homme',{genders:['femme']})];
 const r=pairRound(people,[],[pairKey('b','d')]);
 assert.equal(r.pairs.length,2);
 assert.deepEqual(r.pairs.map(([a,b])=>pairKey(a.uid,b.uid)).sort(),['a|d','b|c']);
});
test('no repeated partners, no blocked pairs, no inference, no forced match',()=>{
 const people=[p('a','femme'),p('b','homme'),p('c','femme',{ev:'B'}),p('d','homme',{genders:undefined}),p('e','homme',{min_age:40})];
 assert.equal(pairRound(people,['a|b']).pairs.length,0);
 assert.equal(pairRound(people,[],['a|b']).pairs.length,0);
 assert.equal(pairRound([p('a','femme'),p('b','femme')]).pairs.length,1);
});
test('an odd participant waits and previously waiting people get priority',()=>{
 const people=[p('a','femme',{genders:['homme']}),p('b','femme',{genders:['homme']}),p('c','homme',{genders:['femme']})];
 const one=pairRound(people), history=one.pairs.map(([a,b])=>pairKey(a.uid,b.uid));
 assert.equal(one.waiting.length,1);
 const two=pairRound(people,history);
 assert.equal(two.pairs.length,1);
 assert.ok(two.pairs.flat().some(p=>p.uid===one.waiting[0].uid));
});
