import {hex,CR,lum} from './oklch.mjs';
const L_light=[0.993,0.977,0.956,0.934,0.913,0.886,0.851,0.781,0.640,0.592,0.520,0.286];
const C_light=[0.10,0.22,0.36,0.48,0.56,0.62,0.70,0.86,1.00,1.00,0.95,0.45];
const L_dark =[0.178,0.213,0.254,0.284,0.313,0.353,0.405,0.488,0.640,0.690,0.777,0.943];
const C_dark =[0.18,0.30,0.52,0.68,0.78,0.84,0.92,1.00,1.00,0.98,0.72,0.30];

// hue, peakChroma(light), peakChroma(dark)
export const SCALES={
  neutral:   {h:255, cl:0.006, cd:0.008},
  brand:     {h:132, cl:0.150, cd:0.170},  // lime, retained as identity
  interactive:{h:255,cl:0.150, cd:0.150},  // one blue: links, selection, focus
  success:   {h:150, cl:0.130, cd:0.140},
  warning:   {h: 75, cl:0.140, cd:0.150},
  danger:    {h: 25, cl:0.160, cd:0.160},
  governance:{h:300, cl:0.140, cd:0.150},
};
export function ramp(s,mode){
  const L=mode==='light'?L_light:L_dark, C=mode==='light'?C_light:C_dark;
  const peak=mode==='light'?s.cl:s.cd;
  return L.map((l,i)=>hex(l,peak*C[i],s.h));
}
if(process.argv[1].endsWith('gen.mjs')){
 for(const mode of ['light','dark']){
  console.log(`\n######## ${mode.toUpperCase()} ########`);
  const N=ramp(SCALES.neutral,mode);
  for(const [name,s] of Object.entries(SCALES)){
   const r=ramp(s,mode);
   const bg=name==='neutral'?r[0]:N[0], bg2=name==='neutral'?r[1]:N[1];
   const c11=CR(r[10],bg2), c12=CR(r[11],bg2), c7=CR(r[6],bg2), c8=CR(r[7],bg2);
   const onSolid = CR(r[8],'#ffffff')>=CR(r[8],'#000000') ? 'white' : 'black';
   const onSolidCR = Math.max(CR(r[8],'#ffffff'),CR(r[8],'#000000'));
   console.log(`\n${name.padEnd(11)} ${r.join(' ')}`);
   console.log(`  ${'text-11 on bg2'.padEnd(16)}${c11.toFixed(2).padStart(5)} ${c11>=4.5?'ok':'FAIL'}   ${'text-12'.padEnd(9)}${c12.toFixed(2).padStart(5)} ${c12>=7?'ok':'low'}`);
   console.log(`  ${'border-7 on bg2'.padEnd(16)}${c7.toFixed(2).padStart(5)} ${c7>=3?'ok':'FAIL'}   ${'border-8'.padEnd(9)}${c8.toFixed(2).padStart(5)} ${c8>=3?'ok':'FAIL'}   solid-9 fg=${onSolid} ${onSolidCR.toFixed(2)} ${onSolidCR>=4.5?'ok':'FAIL'}`);
  }
 }
}
