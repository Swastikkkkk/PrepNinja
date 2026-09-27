// Load test of the Skill Scoring Engine (paper Table 6.2).
// Start the backend (npm start in backend/), then: npm i autocannon && node research/latency/engine_latency.mjs
import autocannon from 'autocannon';
const B=(process.env.API || 'http://localhost:8080') + '/api/engine';
const topics=["arrays","strings","hash-tables","sorting","linked-lists","stacks","queues","recursion","trees","heaps","graphs","dynamic-programming"];
// seed 50 users x 40 attempts
for (let u=0;u<50;u++){ const id=`bench_user_${String(u).padStart(3,'0')}`;
  await fetch(`${B}/profile/${id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({targetCompany:'Google',weeksTotal:12,dailyHours:2})});
  for (let i=0;i<40;i++) await fetch(`${B}/attempt/${id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({topic:topics[i%12],difficulty:'medium',testsPassed:i%4,testsTotal:3,timeMs:300000+i*1000})});
}
const run=(o)=>new Promise(r=>autocannon({connections:50,duration:20,...o},(e,res)=>r(res)));
let n=0;
const st=await run({url:`${B}/state/bench_user_000`,requests:[{setupRequest:(req)=>({...req,path:`/api/engine/state/bench_user_${String(n++%50).padStart(3,'0')}`})}]});
let m=0;
const at=await run({url:`${B}/attempt/bench_user_000`,method:'POST',headers:{'content-type':'application/json'},requests:[{setupRequest:(req)=>({...req,method:'POST',path:`/api/engine/attempt/bench_user_${String(m++%50).padStart(3,'0')}`,body:JSON.stringify({topic:topics[m%12],difficulty:'medium',testsPassed:2,testsTotal:3,timeMs:400000})})}]});
for (const [k,r] of [['state (score + roadmap)',st],['attempt (log + rescore)',at]]) console.log(k, JSON.stringify({req:r.requests.total, mean:r.latency.mean, p50:r.latency.p50, p97_5:r.latency.p97_5, p99:r.latency.p99, errors:r.errors, non2xx:r.non2xx}));
