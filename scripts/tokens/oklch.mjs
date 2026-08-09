// OKLCH -> sRGB hex, plus WCAG contrast. No deps.
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export function oklch2rgb(L,C,H){
  const h=H*Math.PI/180, a=C*Math.cos(h), b=C*Math.sin(h);
  const l_=L+0.3963377774*a+0.2158037573*b;
  const m_=L-0.1055613458*a-0.0638541728*b;
  const s_=L-0.0894841775*a-1.2914855480*b;
  const l=l_**3,m=m_**3,s=s_**3;
  return [ 4.0767416621*l-3.3077115913*m+0.2309699292*s,
          -1.2684380046*l+2.6097574011*m-0.3413193965*s,
          -0.0041960863*l-0.7034186147*m+1.7076147010*s];
}
const gam=c=>c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055;
export function inGamut(L,C,H){return oklch2rgb(L,C,H).every(c=>c>=-1e-4&&c<=1+1e-4)}
export function hex(L,C,H){
  // reduce chroma until in gamut
  let c=C; while(c>0 && !inGamut(L,c,H)) c-=0.002;
  const rgb=oklch2rgb(L,Math.max(c,0),H).map(v=>Math.round(clamp(gam(clamp(v)))*255));
  return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
}
const h2l=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)};
export const lum=h=>{const[r,g,b]=h2l(h);return .2126*r+.7152*g+.0722*b};
export const CR=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
