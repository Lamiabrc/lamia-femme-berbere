// Exact maximum matching within each salon (20 people maximum). No inferred preferences.
export const pairKey = (a,b) => [a,b].sort().join('|');
export function compatible(a,b,met=new Set(),blocked=new Set()) {
  return a.uid !== b.uid && a.ev === b.ev && a.age >= 18 && b.age >= 18
    && a.genders?.includes(b.gender) && b.genders?.includes(a.gender)
    && b.age >= a.min_age && b.age <= a.max_age && a.age >= b.min_age && a.age <= b.max_age
    && !met.has(pairKey(a.uid,b.uid)) && !blocked.has(pairKey(a.uid,b.uid));
}
export function pairRound(present,metPairs=[],blockedPairs=[]) {
  const met=new Set(metPairs), blocked=new Set(blockedPairs), groups=new Map(), pairs=[], waiting=[];
  for(const p of new Map(present.map(p=>[p.uid,p])).values()) {
    if(!groups.has(p.ev)) groups.set(p.ev,[]);
    groups.get(p.ev).push(p);
  }
  for(const people of groups.values()) {
    if(people.length>20) throw new Error('salon_capacity_exceeds_20');
    const count=uid=>metPairs.filter(k=>k.split('|').includes(uid)).length;
    people.sort((a,b)=>count(a.uid)-count(b.uid)||a.uid.localeCompare(b.uid));
    const n=people.length, memo=new Map();
    function solve(mask) {
      if(!mask) return {pairs:[],score:0};
      if(memo.has(mask)) return memo.get(mask);
      let i=0; while(!(mask & (1<<i))) i++;
      const rest=mask & ~(1<<i);
      let best=solve(rest);
      for(let j=i+1;j<n;j++) if((rest & (1<<j)) && compatible(people[i],people[j],met,blocked)) {
        const next=solve(rest & ~(1<<j));
        // Cardinality dominates; ties favor people with fewer previous encounters.
        const score=next.score+10000-count(people[i].uid)-count(people[j].uid);
        if(score>best.score) best={score,pairs:[[people[i],people[j]],...next.pairs]};
      }
      memo.set(mask,best); return best;
    }
    const chosen=solve((1<<n)-1).pairs;
    const used=new Set(chosen.flat().map(p=>p.uid));
    pairs.push(...chosen); waiting.push(...people.filter(p=>!used.has(p.uid)));
  }
  return {pairs,waiting};
}
