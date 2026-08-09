import {hex,CR} from './oklch.mjs';
const h2rgb=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))};
const lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
const gam=c=>Math.round(255*(c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055));
function cvd(hexc,type){const[R,G,B]=h2rgb(hexc).map(lin);
 const L=17.8824*R+43.5161*G+4.11935*B,M=3.45565*R+27.1554*G+3.86714*B,S=0.0299566*R+0.184309*G+1.46709*B;
 let l=L,m=M,s=S; if(type==='deuter')m=0.494207*L+1.24827*S; if(type==='protan')l=2.02344*M-2.52581*S;
 const r=0.0809444479*l-0.130504409*m+0.116721066*s,g=-0.0102485335*l+0.0540193266*m-0.113614708*s,b=-0.000365296938*l-0.00412161469*m+0.693511405*s;
 return [r,g,b].map(v=>gam(Math.max(0,Math.min(1,v))));}
const dE=(a,b)=>{const d=a.map((v,i)=>v-b[i]);return Math.sqrt(2*d[0]**2+4*d[1]**2+3*d[2]**2)};
function score(cols){let worst=1e9;
 for(const t of ['deuter','protan'])for(let i=0;i<cols.length;i++)for(let j=i+1;j<cols.length;j++){
  const d=dE(cvd(cols[i],t),cvd(cols[j],t)); if(d<worst)worst=d;} return worst;}
const HUES=[220,288,340,28,62,108,152,192];
function search(Lmin,Lmax,C,bg,minCR){
 const steps=[...Array(9)].map((_,i)=>Lmin+(Lmax-Lmin)*i/8);
 let best=null;
 for(let iter=0;iter<40000;iter++){
  const Ls=HUES.map(()=>steps[Math.floor(Math.random()*steps.length)]);
  const cols=HUES.map((h,i)=>hex(Ls[i],C,h));
  if(cols.some(c=>CR(c,bg)<minCR))continue;
  const s=score(cols);
  if(!best||s>best.s)best={s,cols,Ls};
 } return best;}
const l=search(0.46,0.70,0.14,'#f7f7f8',3.0);
console.log('light',l.cols.join(' '),'\n  minCVD',l.s.toFixed(0),'\n  CR',l.cols.map(c=>CR(c,'#f7f7f8').toFixed(1)).join(' '));
const d=search(0.62,0.86,0.13,'#18191a',4.5);
console.log('dark ',d.cols.join(' '),'\n  minCVD',d.s.toFixed(0),'\n  CR',d.cols.map(c=>CR(c,'#18191a').toFixed(1)).join(' '));
