// ============================================================================
// REFERENCE ENGINE — Pyraminx (tetrahedron puzzle), "tipless" variant. Validated with node.
// Geometry-derived permutations: 4 faces x 9 small triangles = 36 stickers, 8 actions.
// Sticker index = face*9 + k. Face f is the face OPPOSITE to vertex f. On each face the 9
// triangles are listed: first the 6 point-up ones (loop i,j with i+j<=2), then the 3 point-down ones.
// Action index: 2*v = turn the sub-tetrahedron of side 2 at vertex v by +120 degrees (it contains
// the tip, 12 stickers in total), 2*v+1 = the inverse (-120 degrees). Tips are rigidly attached to
// their vertex piece (standard "without tips" Pyraminx), so the state space has EXACTLY 933,120 states.
// Solved state: colour of a sticker = its face index (0..3).
// State key: 2 bits per sticker packed in 5 characters (see `key`), unambiguous and fast.
// VALIDATED: 12 stickers per layer (gap 0.51 between layers), every move has order 3, move then
// inverse = identity, full BFS finds 933,120 states, diameter 11, exact sphere sizes at distance
// d = 0..11: 1, 8, 48, 288, 1728, 9896, 51808, 220111, 480467, 166276, 2457, 32.
// ============================================================================
// Pyraminx (tetraèdre) : permutations dérivées de la géométrie. Variante "sans pointes" : 933 120 états.
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.sqrt(dot(a,a)), unit=a=>mul(a,1/norm(a));
function rotAxis(p,ax,ang){ const k=unit(ax),c=Math.cos(ang),s=Math.sin(ang); const kp=cross(k,p), kd=dot(k,p); return add(add(mul(p,c),mul(kp,s)),mul(k,kd*(1-c))); }
const VERT=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
// face f = face opposite to vertex f ; 9 petits triangles par face : 6 pointe-en-haut + 3 pointe-en-bas
const stickers=[];
for(let f=0;f<4;f++){
  const [A,B,C]=VERT.filter((_,i)=>i!==f); const P=(i,j)=>add(A,add(mul(sub(B,A),i/3),mul(sub(C,A),j/3)));
  const tris=[]; for(let i=0;i<3;i++)for(let j=0;i+j<3;j++) tris.push([P(i,j),P(i+1,j),P(i,j+1)]);
  for(let i=0;i<2;i++)for(let j=0;i+j<2;j++) tris.push([P(i+1,j),P(i,j+1),P(i+1,j+1)]);
  tris.forEach(t=>stickers.push({face:f,tri:t,p:mul(add(add(t[0],t[1]),t[2]),1/3)}));
}
const H=4*norm(VERT[0])/3; // hauteur du tétraèdre
const perms=[],names=[],layerSizes=[],gaps=[];
VERT.forEach((v,vi)=>{
  const u=unit(v); const dist=stickers.map((s,i)=>[norm(v)-dot(s.p,u),i]).sort((a,b)=>a[0]-b[0]);
  const cut=2*H/3; const layer=dist.filter(d=>d[0]<cut).map(d=>d[1]);
  gaps.push(Math.min(...dist.filter(d=>d[0]>=cut).map(d=>d[0]))-Math.max(...dist.filter(d=>d[0]<cut).map(d=>d[0]))); layerSizes.push(layer.length);
  for(const dir of [1,-1]){ const p=Array.from({length:36},(_,i)=>i);
    for(const i of layer){ const q=rotAxis(stickers[i].p,v,dir*2*Math.PI/3); let best=-1,bd=1e9; stickers.forEach((s,j)=>{const d=norm(sub(s.p,q)); if(d<bd){bd=d;best=j;}});
      if(bd>1e-6) throw new Error('pas de correspondance '+bd); p[best]=i; }
    perms.push(p); names.push('ULRB'[vi]+(dir>0?'':"'")); }
});
const solved=Uint8Array.from(stickers.map(s=>s.face));
// clé compacte : 2 bits par autocollant -> 5 caractères de 16 bits
const key=s=>{ let w0=0,w1=0,w2=0; for(let i=0;i<16;i++){ w0|=s[i]<<(2*i); w1|=s[16+i]<<(2*i);} for(let i=0;i<4;i++) w2|=s[32+i]<<(2*i);
  return String.fromCharCode(w0&65535,w0>>>16,w1&65535,w1>>>16,w2); };
function buildPyra(makePuzzle){ const P=makePuzzle('Pyraminx',36,perms,names,solved); P.key=key; P.solvedKey=key(solved); P.isSolved=s=>key(s)===P.solvedKey; P.stickers=stickers; P.vertices=VERT; return P; }
module.exports={buildPyra,stickers,perms,names,layerSizes,gaps,VERT,key,solved};
