import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()});
const doc=await io.read(process.argv[2]);
const want=new RegExp(process.argv[3]||'leg','i');

// garment centre, for deciding which way is "outward"
let gmin=[1e9,1e9,1e9],gmax=[-1e9,-1e9,-1e9];
for(const m of doc.getRoot().listMeshes()){
  if(!want.test(m.getName()))continue;
  const a=m.listPrimitives()[0].getAttribute('POSITION');
  const lo=a.getMin([]),hi=a.getMax([]);
  for(let i=0;i<3;i++){gmin[i]=Math.min(gmin[i],lo[i]);gmax[i]=Math.max(gmax[i],hi[i]);}
}
const c=[0,1,2].map(i=>(gmin[i]+gmax[i])/2);

for(const mesh of doc.getRoot().listMeshes()){
  if(!want.test(mesh.getName()))continue;
  let outerPos=0,outerNeg=0;
  for(const prim of mesh.listPrimitives()){
    const pos=prim.getAttribute('POSITION').getArray();
    const uv=prim.getAttribute('TEXCOORD_0').getArray();
    const idx=prim.getIndices().getArray();
    for(let t=0;t<idx.length;t+=3){
      const [i0,i1,i2]=[idx[t],idx[t+1],idx[t+2]];
      const P=i=>[pos[i*3],pos[i*3+1],pos[i*3+2]];
      const [a,b,d]=[P(i0),P(i1),P(i2)];
      // geometric normal from winding
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], v=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const ctr=[(a[0]+b[0]+d[0])/3,(a[1]+b[1]+d[1])/3,(a[2]+b[2]+d[2])/3];
      // outward = away from garment centre, in the Z (front/back) sense
      const outward=(ctr[2]-c[2]);
      const facing=n[2];
      if(Math.abs(facing)<1e-12) continue;
      // only count triangles on the panel's dominant face
      if(outward*facing<=0) continue;      // inner surface: skip
      const U=i=>[uv[i*2],uv[i*2+1]];
      const [ua,ub,ud]=[U(i0),U(i1),U(i2)];
      const cross=(ub[0]-ua[0])*(ud[1]-ua[1])-(ud[0]-ua[0])*(ub[1]-ua[1]);
      if(cross>0)outerPos++;else if(cross<0)outerNeg++;
    }
  }
  const total=outerPos+outerNeg;
  const sign=outerPos>outerNeg?'+ (CCW)':'- (CW)';
  console.log(`${mesh.getName().padEnd(17)} outer-face tris=${total}  uv-winding ${sign}  (+${outerPos} / -${outerNeg})`);
}
