// ATS reliability test (paper Section 6.3, Table 6.3). Backend must be running with GEMINI_API_KEY set.
// node research/llm/ats_consistency.mjs research/llm/resumes   (expects PDFs of the .docx resumes)
import fs from 'fs';
const API=(process.env.API||'http://localhost:8080')+'/api/analyze-resume', DIR=process.argv[2];
const call=async(file,role)=>{const fd=new FormData();fd.append('file',new Blob([fs.readFileSync(`${DIR}/${file}`)],{type:'application/pdf'}),file);fd.append('targetRole',role);
 for(let a=0;a<3;a++){const r=await fetch(API,{method:'POST',body:fd});const j=await r.json().catch(()=>({}));if(typeof j.score==='number')return j;await new Promise(s=>setTimeout(s,3000));}
 return null;};
const out=[];const ROLE='SDE-1 Backend Engineer';
const PARA=['Entry-level backend software engineer','Junior Software Development Engineer (backend)','Backend developer, new graduate'];
for(const f of ['R1_strong.pdf','R2_medium.pdf','R3_weak.pdf','R4_tables.pdf','R5_offtarget.pdf'])
 for(let i=0;i<10;i++){const j=await call(f,ROLE);out.push({exp:'repeat',file:f,role:ROLE,run:i,score:j?.score??null,breakdown:j?.breakdown??null,nFound:j?.keywordsFound?.length??null,nMissing:j?.keywordsMissing?.length??null});console.log(f,i,j?.score);}
for(const f of ['R1_strong.pdf','R2_medium.pdf'])
 for(const role of PARA) for(let i=0;i<5;i++){const j=await call(f,role);out.push({exp:'paraphrase',file:f,role,run:i,score:j?.score??null,breakdown:j?.breakdown??null});console.log(f,role,i,j?.score);}
fs.writeFileSync(`ats_results.json`,JSON.stringify(out,null,1));console.log('DONE');
