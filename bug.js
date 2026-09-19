import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from './vendor/BufferGeometryUtils.js';
import { sourceSteel } from './steel.js';

function createBugGeometry(simplified=false) {
  const parts=[];
  function add(g,side=0,front=0){
    if(g.index)g=g.toNonIndexed();
    const n=g.attributes.position.count,limb=new Float32Array(n*2);
    for(let i=0;i<n;i++){limb[i*2]=side;limb[i*2+1]=front;}
    g.setAttribute('limb',new THREE.BufferAttribute(limb,2));
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
    parts.push(g);
  }
  function armor(cx,cy,cz,w,h,l){
    // Clipped corners and a pitched crown catch narrow highlights along black plates.
    const outline=[[-.65,-1],[.65,-1],[1,-.65],[1,.55],[.57,1],[-.57,1],[-1,.55],[-1,-.65]];
    const vertices=[],p=(i,top)=>[cx+outline[i][0]*w,cy+(top?h:0),cz+outline[i][1]*l];
    const tri=(a,b,c)=>vertices.push(...a,...b,...c);
    for(let i=0;i<8;i++){
      const j=(i+1)%8, a=p(i,false),b=p(j,false),c=p(j,true),d=p(i,true);
      tri(a,c,b);tri(a,d,c);tri(d,[cx,cy+h*1.35,cz],c);tri(a,b,[cx,cy,cz]);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(g);
  }
  armor(0,.10,-.04,.094,.074,.19);
  armor(0,.12,.169,.065,.047,.065);
  // The split dorsal plates and transverse ribs give each body a machined silhouette.
  for(const side of [-1,1]){
    const plate=new THREE.BoxGeometry(.037,.017,.20);plate.rotateZ(side*-.11);plate.translate(side*.03,.208,-.057);add(plate);
  }
  if(!simplified)for(let k=0;k<3;k++){const g=new THREE.BoxGeometry(.107,.012,.012);g.translate(0,.196,-.14+k*.045);add(g);}
  function strut(a,b,r1,r2,side,front){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const g=new THREE.CylinderGeometry(r2,r1,delta.length(),simplified?3:4,1,simplified);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    g.translate(...start.add(end).multiplyScalar(.5).toArray());add(g,side,front);
  }
  for(const side of [-1,1])for(const front of [-1,1]){
    const hip=[side*.078,.135,front*.107],knee=[side*.195,.193,front*.174],foot=[side*.294,.009,front*.24];
    strut(hip,knee,.025,.016,side,front);strut(knee,foot,.022,.0015,side,front);
    if(!simplified){const joint=new THREE.OctahedronGeometry(.027);joint.translate(...knee);add(joint,side,front);}
  }
  const merged=mergeGeometries(parts,false),geometry=mergeVertices(merged);merged.dispose();parts.forEach(g=>g.dispose());
  return geometry;
}

export function makeBugs(count, settings) {
  const geometry=createBugGeometry(),mobileGeometry=createBugGeometry(true);
  const motion=new THREE.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('motion',motion);mobileGeometry.setAttribute('motion',motion);
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(.026,.017,.014),metalness:settings.metalness,roughness:settings.roughness});
  material.name='Armor';
  const bugs=new THREE.InstancedMesh(geometry,material,count);bugs.name='Iron Hunger';bugs.frustumCulled=false;bugs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sourceSteel(bugs,material);
  const steelCompile=material.onBeforeCompile,gaitUniform={value:settings.legReach};
  const applyGait=shader=>{
    shader.uniforms.legReach=gaitUniform;
    const defs=`attribute vec2 limb;attribute vec4 motion;uniform float legReach;
    mat3 legRotation(){float c=motion.x,s=motion.y*limb.y;return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
    `;
    shader.vertexShader=defs+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      if(abs(limb.x)>.5)objectNormal=legRotation()*objectNormal;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      if(abs(limb.x)>.5){
        vec3 hinge=vec3(limb.x*.078,.135,limb.y*.107);
        vec3 local=position-hinge;local.xz*=legReach;
        transformed=hinge+legRotation()*local;
        float lift=limb.x*limb.y>0.?motion.z:motion.w;
        transformed.y+=lift*smoothstep(.08,.28,abs(position.x));
      }`);
  };
  material.onBeforeCompile=shader=>{steelCompile(shader);applyGait(shader);};
  material.customProgramCacheKey=()=> 'iron-hunger-steel-gait-v2';
  // The blurred underside reflection needs a silhouette, not a second PBR/steel shader.
  const reflectionMaterial=new THREE.MeshBasicMaterial({color:0x100807});
  reflectionMaterial.onBeforeCompile=applyGait;reflectionMaterial.customProgramCacheKey=()=> 'iron-hunger-reflection-v2';
  return {bugs,material,motion,gaitUniform,reflectionMaterial,geometry,mobileGeometry};
}
