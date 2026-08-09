import {CR} from './oklch.mjs';
const OLD={dark:{surface:'#12181c',raised:'#182025',soft:'#1d272b',border:'#344146',bs:'#4b5b61',text:'#f3f7f4',sec:'#aab6b1',muted:'#86938e',accent:'#8bd32f',success:'#4ec06b',warning:'#e2af64',danger:'#ef8078',info:'#61a7ff',gov:'#b98fe4'},
        light:{surface:'#ffffff',raised:'#f7faf8',soft:'#edf3ef',border:'#cbd6d0',bs:'#96a79f',text:'#15201b',sec:'#415149',muted:'#64746c',accent:'#579b13',success:'#2f8f4c',warning:'#a9741f',danger:'#b93631',info:'#2f6fd0',gov:'#7b4fc0'}};
const NEW={dark:{surface:'#18191a',raised:'#212325',soft:'#282a2d',border:'#393b3f',bs:'#46494d',ctl:'#898c91',text:'#ebecee',sec:'#b4b7ba',muted:'#b4b7ba',accent:'#99c773',success:'#87c994',warning:'#dfac64',danger:'#f79991',info:'#87bafb',gov:'#c1a7f1'},
        light:{surface:'#f7f7f8',raised:'#eff0f2',soft:'#e8e9eb',border:'#d8d9dc',bs:'#ccced1',ctl:'#8a8c90',text:'#292a2c',sec:'#67696c',muted:'#67696c',accent:'#487904',success:'#257c40',warning:'#8d5e02',danger:'#b03b39',info:'#2569b8',gov:'#7554a9'}};
const fg=['text','sec','muted','accent','success','warning','danger','info','gov'];
const rows=[];
for(const mode of ['light','dark']){
 const o=OLD[mode],n=NEW[mode];
 for(const k of fg) rows.push([mode,`${k} on surface`,CR(o[k],o.surface),CR(n[k],n.surface),4.5]);
 rows.push([mode,'border on surface',CR(o.border,o.surface),CR(n.border,n.surface),null]);
 rows.push([mode,'control border on surface',CR(o.bs,o.surface),CR(n.ctl,n.surface),3]);
 rows.push([mode,'raised vs surface (ΔCR)',CR(o.raised,o.surface),CR(n.raised,n.surface),1.2]);
 rows.push([mode,'soft vs surface (ΔCR)',CR(o.soft,o.surface),CR(n.soft,n.surface),1.2]);
}
const m=(v,t)=>t===null?'  –  ':(v>=t?'pass':'FAIL');
console.log('| theme | pair | current | proposed | target | current | proposed |');
console.log('|---|---|--:|--:|--:|---|---|');
for(const[mode,name,a,b,t]of rows) console.log(`| ${mode} | ${name} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${t??'—'} | ${m(a,t)} | ${m(b,t)} |`);
const fails=(T)=>rows.filter(([,,a,b,t])=>t!==null&&(T==='a'?a:b)<t).length;
console.log(`\ncurrent failures: ${fails('a')} / ${rows.filter(r=>r[4]!==null).length}   proposed failures: ${fails('b')} / ${rows.filter(r=>r[4]!==null).length}`);
