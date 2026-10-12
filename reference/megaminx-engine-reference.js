// ============================================================================
// REFERENCE ENGINE — Megaminx (dodecahedron puzzle), validated with node.
// Geometry-derived permutations: 12 faces, 132 stickers (11 per face), 24 actions.
// Sticker index = face*11 + k, with k = 0 (face centre), then for i = 0..4:
//   k = 1+2i  -> corner sticker at vertex i of the face
//   k = 2+2i  -> edge sticker on the edge between vertex i and vertex i+1
// Action index: 2*g = turn face g by +72 degrees, 2*g+1 = the inverse (-72 degrees).
// Solved state: colour of sticker = its face index (0..11).
// IMPORTANT: with 12 colours, a state key made with array.join('') is AMBIGUOUS.
//            Use String.fromCharCode(65 + colour) for each sticker instead.
// Verified: 26 stickers in each layer (25 move, centre stays), every move has order 5,
// a move followed by its inverse is the identity, opposite faces commute, adjacent
// faces do not commute. Exact sphere sizes at distance d = 0..4: 1, 24, 408, 6208, 90144.
// ============================================================================
// Megaminx : dérivation géométrique des permutations
const phi=(1+Math.sqrt(5))/2;
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.sqrt(dot(a,a)), unit=a=>mul(a,1/norm(a));
function rotAxis(p,ax,ang){ const k=unit(ax),c=Math.cos(ang),s=Math.sin(ang); const kp=cross(k,p), kd=dot(k,p);
  return add(add(mul(p,c),mul(kp,s)),mul(k,kd*(1-c))); }
// 20 sommets
const V=[]; for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])V.push([x,y,z]);
for(const a of[-1,1])for(const b of[-1,1]){ V.push([0,a/phi,b*phi]); V.push([a/phi,b*phi,0]); V.push([a*phi,0,b/phi]); }
// 12 normales de faces (icosaèdre)
const N=[]; for(const a of[-1,1])for(const b of[-1,1]){ N.push(unit([0,a*phi,b])); N.push(unit([a,0,b*phi])); N.push(unit([a*phi,b,0])); }
// vérifie que chaque normale a 5 sommets au maximum
const faces=N.map(n=>{ const m=Math.max(...V.map(v=>dot(v,n))); let vs=V.filter(v=>Math.abs(dot(v,n)-m)<1e-6);
  const c=mul(vs.reduce((s,v)=>add(s,v),[0,0,0]),1/vs.length);
  const u=unit(sub(vs[0],c)), w=cross(n,u);
  vs.sort((a,b)=>Math.atan2(dot(sub(a,c),w),dot(sub(a,c),u))-Math.atan2(dot(sub(b,c),w),dot(sub(b,c),u)));
  return {n,vs,c}; });
// autocollants : par face 1 centre + 5 sommets + 5 arêtes
const S=[]; const tc=0.78, te=0.62; // facteurs de "tirage" vers le centre de la face
faces.forEach((f,fi)=>{
  S.push({face:fi,type:'C',p:f.c});
  for(let i=0;i<5;i++){ const v=f.vs[i], w=f.vs[(i+1)%5];
    S.push({face:fi,type:'V',p:add(f.c,mul(sub(v,f.c),tc))});
    S.push({face:fi,type:'E',p:add(f.c,mul(sub(mul(add(v,w),0.5),f.c),te))}); }
});
// actions : face g, rotation +72° (2g) et -72° (2g+1)
function layerOf(g){ const n=faces[g].n; const d=S.map((s,i)=>[dot(s.p,n),i]).sort((a,b)=>b[0]-a[0]); return d; }
const perms=[], names=[], layers=[];
for(let g=0;g<12;g++){
  const d=layerOf(g); // trouve le plus grand saut parmi les 40 premières valeurs
  let gapIdx=-1,gap=0; for(let i=0;i<60;i++){ const dd=d[i][0]-d[i+1][0]; if(dd>gap){gap=dd;gapIdx=i;} }
  const layer=d.slice(0,gapIdx+1).map(x=>x[1]); layers.push({size:layer.length,gap});
  for(const dir of [1,-1]){
    const p=Array.from({length:S.length},(_,i)=>i);
    for(const i of layer){ const q=rotAxis(S[i].p,faces[g].n,dir*2*Math.PI/5);
      let best=-1,bd=1e9; S.forEach((s,j)=>{ if(s.type!==S[i].type) return; const dd=norm(sub(s.p,q)); if(dd<bd){bd=dd;best=j;} });
      if(bd>1e-6) throw new Error(`pas de correspondance g=${g} i=${i} d=${bd}`);
      p[best]=i; } // le contenu de i va en best
    perms.push(p); names.push(`F${g}${dir>0?'':"'"}`);
  }
}
module.exports={S,faces,perms,names,layers};
if(require.main===module){
  console.log('autocollants',S.length,'faces',faces.length,'sommets/face',faces.map(f=>f.vs.length).join(''));
  console.log('couches',[...new Set(layers.map(l=>l.size))],'gap min',Math.min(...layers.map(l=>l.gap)).toFixed(3));
  // permutations valides ?
  let ok=true; perms.forEach(p=>{ if(new Set(p).size!==p.length) ok=false; }); console.log('perms bijectives',ok);
  // inverses, ordre 5
  const comp=(p,q)=>p.map((_,i)=>q[p[i]]); const idn=Array.from({length:S.length},(_,i)=>i);
  let invOk=true,ord=true; for(let a=0;a<perms.length;a+=2){ const c=comp(perms[a],perms[a+1]); if(c.some((v,i)=>v!==i)) invOk=false;
    let r=idn; for(let k=0;k<5;k++) r=comp(r,perms[a]); if(r.some((v,i)=>v!==i)) ord=false; }
  console.log('inverses ok',invOk,'ordre 5 ok',ord);
  // couleurs : 12 couleurs, autocollant -> face
  // relation de commutation : deux faces non adjacentes commutent ? (F0 et face opposée)
  const opp=faces.findIndex(f=>dot(f.n,faces[0].n)<-0.99); const A=perms[0],B=perms[2*opp];
  console.log('faces opposées commutent',JSON.stringify(comp(A,B))===JSON.stringify(comp(B,A)));
  // adjacente : ne commute pas
  const adj=faces.findIndex((f,i)=>i!==0&&dot(f.n,faces[0].n)>0.4); const C=perms[2*adj];
  console.log('faces adjacentes ne commutent pas',JSON.stringify(comp(A,C))!==JSON.stringify(comp(C,A)));
  // chaque couche déplace 26 autocollants ?
  console.log('autocollants déplacés par un mouvement',perms[0].filter((v,i)=>v!==i).length);
}
