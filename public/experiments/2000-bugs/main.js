import * as THREE from 'three';
import { defaults, Horde } from './simulation.js';
import { makeBugs } from './bug.js';

const settings={...defaults}, query=new URLSearchParams(location.search);
const sceneEl=document.querySelector('#scene'), panelEl=document.querySelector('#controls');
if(query.has('clean'))sessionStorage.setItem('sh-panel-collapsed','true');
const panel=new window.SHPanel(panelEl),bindings=[];
const title=document.createElement('h1');title.className='entry-heading';title.textContent='2000 Mechanical Bugs';
const status=document.createElement('p');status.className='entry-status';status.setAttribute('role','status');
panel._body.prepend(title);
function togglePanel(){document.dispatchEvent(new KeyboardEvent('keydown',{code:'Backquote',key:'`',bubbles:true}));}
function bind(folder,type,key,opts={}){
  const c=folder[type](settings,key,opts).on('change',()=>applySettings());
  c._input?.setAttribute('aria-label',opts.label||key);bindings.push([key,c]);return c;
}
function slider(f,k,label,min,max,step){return bind(f,'slider',k,{label,min,max,step});}

const horde=panel.folder('The horde');
slider(horde,'count','Machines',100,2000,100);slider(horde,'speed','Pursuit speed',.5,7,.1);
slider(horde,'urgency','Desperation',2,16,.2);slider(horde,'scurry','Scurry',0,2.5,.05);
slider(horde,'separation','Personal space',.65,1.2,.01);slider(horde,'climbing','Climbing',0,1.8,.05);
const form=panel.folder('Body + legs',{expanded:false});
slider(form,'bugScale','Body size',.7,1.4,.05);slider(form,'legReach','Spike leg reach',.7,1.35,.05);slider(form,'legPace','Leg cadence',.4,2,.05);
const shock=panel.folder('Shockwave',{expanded:false});
slider(shock,'shockStrength','Impulse',3,18,.2);slider(shock,'shockRadius','Reach',3,14,.25);slider(shock,'waveSpeed','Wave speed',10,35,.5);slider(shock,'recovery','Earliest recovery (s)',.2,2,.05);slider(shock,'recoverySpread','Recovery spread (s)',0,10,.1);
const light=panel.folder('Black steel + light',{expanded:false});
slider(light,'steelTone','Steel tone',.5,1.8,.05);slider(light,'roughness','Roughness',.2,.7,.01);slider(light,'metalness','Metalness',.5,1,.01);
slider(light,'keyLight','Warm key',0,6,.1);slider(light,'rimLight','Red edge',0,5,.1);slider(light,'environmentLight','Studio reflection',0,2,.05);slider(light,'exposure','Exposure',.6,1.5,.05);
const floor=panel.folder('Crimson stage',{expanded:false});
bind(floor,'color','stageColor',{label:'Ground red'});slider(floor,'stageShade','Edge falloff',0,.45,.01);slider(floor,'sheen','Surface sheen',0,.35,.01);slider(floor,'reflection','Reflection strength',0,.35,.01);slider(floor,'shadowOpacity','Contact shadows',0,.5,.01);bind(floor,'toggle','reflections',{label:'Live reflections'});
const view=panel.folder('Composition + rendering',{expanded:false});
slider(view,'framing','Camera framing',.7,1.5,.05);slider(view,'resolution','Pixel density',.75,2,.25);slider(view,'seed','Scatter seed',1,99999,1).on('change',()=>sim.reset());
bind(view,'select','quality',{label:'Performance profile',options:['Auto','High','Mobile']});
bind(view,'toggle','adaptiveResolution',{label:'Adapt pixel density'});slider(view,'frameRate','Frame rate',30,60,30);
const session=panel.folder('Session');
session.button('Copy JSON',copySettings);session.button('Reset all',reset);
session.button('Scatter the horde',()=>sim.reset());session.button('Shockwave',()=>sim.shock(sim.target.x,sim.target.z));
bind(session,'toggle','paused',{label:'Pause'});session.button('Hide controls',togglePanel);
session._body.append(status);
for(const event of ['pointerdown','pointermove','pointerup','wheel'])panelEl.addEventListener(event,e=>e.stopPropagation());
panelEl.addEventListener('keydown',e=>{if(e.code!=='Backquote')e.stopPropagation();});

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.info.autoReset=false;
sceneEl.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Interactive black steel horde');
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-16,16,10,-10,.1,100);
camera.position.set(0,35,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
const sim=new Horde(settings), {bugs,material,motion,gaitUniform,reflectionMaterial,geometry,mobileGeometry}=makeBugs(2000,settings);scene.add(bugs);
const key=new THREE.DirectionalLight(0xffe4d3,settings.keyLight);key.position.set(-9,16,7);scene.add(key);
const rim=new THREE.DirectionalLight(0xff3824,settings.rimLight);rim.position.set(8,7,-10);scene.add(rim);
const fill=new THREE.HemisphereLight(0xb4a69c,0x950808,.5);scene.add(fill);
const env=new THREE.Scene();env.background=new THREE.Color(0x100809);
for(const [p,sz,color]of [[[-8,12,5],[6,12],0xffe0c9],[[8,8,-7],[4,12],0xff3925],[[1,17,-2],[3,7],0xc3ccdc]]){
  const card=new THREE.Mesh(new THREE.PlaneGeometry(...sz),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));card.position.fromArray(p);card.lookAt(0,0,0);env.add(card);
}
const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(env,.06,.1,100);scene.environment=environment.texture;pmrem.dispose();env.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});

// One low-resolution reflection pass for all 2,000 instances.
const mirror=new THREE.WebGLRenderTarget(512,512),mirrorCamera=camera.clone(),reflectionMatrix=new THREE.Matrix4();
const waveUniforms={centers:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,-100,1))},ages:{value:new Float32Array(8)},waveCount:{value:0}};
const groundUniforms={...waveUniforms,reflectionTexture:{value:mirror.texture},reflectionMatrix:{value:reflectionMatrix},red:{value:new THREE.Color(settings.stageColor)},strength:{value:settings.reflection},shade:{value:settings.stageShade},sheen:{value:settings.sheen},exposure:{value:settings.exposure},worldSize:{value:new THREE.Vector2(32,20)},pixel:{value:new THREE.Vector2(1/512,1/512)}};
const groundMaterial=new THREE.ShaderMaterial({uniforms:groundUniforms,vertexShader:`uniform mat4 reflectionMatrix;varying vec4 reflectionUV;varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflectionUV=reflectionMatrix*p;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`
uniform sampler2D reflectionTexture;uniform vec3 red;uniform float strength,shade,sheen,exposure;uniform vec2 worldSize,pixel;varying vec4 reflectionUV;varying vec3 world;
uniform vec4 centers[8];uniform float ages[8];uniform int waveCount;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 p=world.xz/worldSize;vec2 uv=reflectionUV.xy/reflectionUV.w;
vec4 r=vec4(0.);if(strength>0.){r=texture2D(reflectionTexture,uv)*.32;
r+=(texture2D(reflectionTexture,uv+pixel*vec2(2.,0.))+texture2D(reflectionTexture,uv-pixel*vec2(2.,0.))+texture2D(reflectionTexture,uv+pixel*vec2(0.,2.))+texture2D(reflectionTexture,uv-pixel*vec2(0.,2.)))*.17;}
float vignette=dot(p,p)*1.5;
float softbox=exp(-pow((p.x*.75-p.y*.45+.27)*2.6,2.))*exp(-pow((p.y+.18)*1.5,2.));
vec3 color=red*(1.-shade*vignette)+vec3(.19,.07,.035)*softbox*sheen;
color*=1.+(hash(gl_FragCoord.xy)-.5)*.018;
color=mix(color,min(color,r.rgb*red*1.8),r.a*strength);
gl_FragColor=vec4(color*exposure,1.);
#include <colorspace_fragment>
float light=0.;for(int i=0;i<8;i++){if(i>=waveCount)break;float d=length(world.xz-centers[i].xy),r=centers[i].z,fade=clamp(1.-r/centers[i].w,0.,1.);float band=exp(-pow((d-r)/.075,2.))*.55+exp(-pow((d-r)/.27,2.))*.14;light+=band*fade+exp(-d*d*2.)*max(0.,1.-ages[i]*8.)*.3;}
gl_FragColor.rgb+=vec3(1.,.19,.065)*light*exposure;
}`});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.025;scene.add(ground);

// Analytic soft contacts avoid a costly 2,000-caster shadow map on mobile.
const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:settings.shadowOpacity}},vertexShader:`varying vec2 vUv;attribute vec4 shadowData;attribute vec2 shadowHeading;varying float lift;void main(){vUv=uv;lift=shadowData.z;vec2 p=position.xz*vec2(.63+lift*.19,.76+lift*.19)*shadowData.w;float c=shadowHeading.x,s=shadowHeading.y;vec2 world=vec2(c*p.x+s*p.y,-s*p.x+c*p.y)+shadowData.xy+vec2(.17,-.12)*lift;gl_Position=projectionMatrix*viewMatrix*vec4(world.x,-.018,world.y,1.);}`,fragmentShader:`uniform float opacity;varying vec2 vUv;varying float lift;void main(){vec2 p=vUv*2.-1.;float a=exp(-dot(p,p)*3.5)*smoothstep(1.,.55,length(p))*opacity*exp(-lift*.65);gl_FragColor=vec4(.075,0.,.003,a);}`});
const shadowGeometry=new THREE.PlaneGeometry(1,1);shadowGeometry.rotateX(-Math.PI/2);
const shadowData=new THREE.InstancedBufferAttribute(new Float32Array(2000*4),4).setUsage(THREE.DynamicDrawUsage);
const shadowHeading=new THREE.InstancedBufferAttribute(new Float32Array(2000*2),2).setUsage(THREE.DynamicDrawUsage);
shadowGeometry.setAttribute('shadowData',shadowData);shadowGeometry.setAttribute('shadowHeading',shadowHeading);
const shadows=new THREE.InstancedMesh(shadowGeometry,shadowMaterial,2000);shadows.frustumCulled=false;shadows.renderOrder=1;scene.add(shadows);

const previous=Object.fromEntries(['x','y','z','angle','roll','pitch','gait','speedNow'].map(k=>[k,new Float32Array(2000)]));
function savePrevious(){for(const k in previous)previous[k].set(sim[k]);}
const resetSimulation=sim.reset.bind(sim);sim.reset=()=>{resetSimulation();savePrevious();accumulator=0;dirty=true;};
function updateInstances(alpha=1){
  const s=settings;
  bugs.count=shadows.count=s.count;
  const matrices=bugs.instanceMatrix.array,legs=motion.array,contacts=shadowData.array,headings=shadowHeading.array;
  for(let i=0;i<s.count;i++){
    const scale=sim.size[i]*s.bugScale,stunned=sim.stun[i]>0;
    const gait=previous.gait[i]+(sim.gait[i]-previous.gait[i])*alpha,phase=gait+sim.phase[i],sinPhase=Math.sin(phase),cosPhase=Math.cos(phase);
    const x=previous.x[i]+(sim.x[i]-previous.x[i])*alpha,y=previous.y[i]+(sim.y[i]-previous.y[i])*alpha,z=previous.z[i]+(sim.z[i]-previous.z[i])*alpha;
    let angleDelta=sim.angle[i]-previous.angle[i];if(angleDelta>Math.PI)angleDelta-=Math.PI*2;else if(angleDelta<-Math.PI)angleDelta+=Math.PI*2;
    const yaw=previous.angle[i]+angleDelta*alpha;
    const pitch=previous.pitch[i]+(sim.pitch[i]-previous.pitch[i])*alpha+(stunned?0:Math.sin(sim.phase[i]+sim.time*16)*.035*s.scurry);
    const roll=previous.roll[i]+(sim.roll[i]-previous.roll[i])*alpha+(stunned?0:sinPhase*.048*s.scurry);
    const a=Math.cos(pitch),b=Math.sin(pitch),c=Math.cos(yaw),d=Math.sin(yaw),e=Math.cos(roll),f=Math.sin(roll),ce=c*e,cf=c*f,de=d*e,df=d*f;
    // Direct YXZ matrix writes avoid 4,000 Object3D/quaternion updates per frame.
    const m=i*16;matrices[m]=(ce+df*b)*scale;matrices[m+1]=a*f*scale;matrices[m+2]=(cf*b-de)*scale;matrices[m+3]=0;
    matrices[m+4]=(de*b-cf)*scale;matrices[m+5]=a*e*scale;matrices[m+6]=(df+ce*b)*scale;matrices[m+7]=0;
    matrices[m+8]=a*d*scale;matrices[m+9]=-b*scale;matrices[m+10]=a*c*scale;matrices[m+11]=0;
    matrices[m+12]=x;matrices[m+13]=y+(stunned?0:Math.sin(gait*2+sim.phase[i])*.008*s.scurry);matrices[m+14]=z;matrices[m+15]=1;
    const amplitude=stunned?.7:Math.min(1,.25+(previous.speedNow[i]+(sim.speedNow[i]-previous.speedNow[i])*alpha)*.4),legAngle=sinPhase*.36*amplitude,l=i*4;
    legs[l]=Math.cos(legAngle);legs[l+1]=Math.sin(legAngle);legs[l+2]=Math.max(0,cosPhase)*.068*amplitude;legs[l+3]=Math.max(0,-cosPhase)*.068*amplitude;
    contacts[l]=x;contacts[l+1]=z;contacts[l+2]=y;contacts[l+3]=scale;headings[i*2]=c;headings[i*2+1]=d;
  }
  bugs.instanceMatrix.needsUpdate=motion.needsUpdate=shadowData.needsUpdate=shadowHeading.needsUpdate=true;
  waveUniforms.waveCount.value=sim.waves.length;
  for(let i=0;i<sim.waves.length;i++){const w=sim.waves[i];waveUniforms.centers.value[i].set(w.x,w.z,w.radius,w.reach);waveUniforms.ages.value[i]=w.age;}
}
let viewWidth=0,viewHeight=0,mobileMode=false,physicsStep=1/60,adaptiveScale=1,dirty=true,mirrorDirty=true,lastMirror=-Infinity;
let canvasWidth=0,canvasHeight=0;
let last=performance.now(),lastRendered=last,accumulator=0,frames=0,frameMs=16.7,ready=false,contextLost=false;
let workMs=0,simulationMs=0,renderMs=0,qualityTimer=0,slowTime=0,fastTime=0,renderPasses=0;
function resize(){
  const {width,height}=sceneEl.getBoundingClientRect();if(width<1||height<1)return;
  const nextMobile=settings.quality==='Mobile'||(settings.quality==='Auto'&&(matchMedia('(pointer: coarse)').matches||width<650));
  if(nextMobile!==mobileMode){mobileMode=nextMobile;physicsStep=mobileMode?1/30:1/60;accumulator=0;savePrevious();adaptiveScale=1;}
  bugs.geometry=mobileMode?mobileGeometry:geometry;
  const ratio=Math.min(devicePixelRatio||1,settings.resolution,mobileMode?1.25:2)*(settings.adaptiveResolution?adaptiveScale:1);
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  if(canvasWidth!==width||canvasHeight!==height){renderer.setSize(width,height,false);canvasWidth=width;canvasHeight=height;}
  const aspect=width/height,span=Math.max(20,21/aspect)/settings.framing;
  viewWidth=span*aspect;viewHeight=span;
  Object.assign(camera,{left:-viewWidth/2,right:viewWidth/2,top:span/2,bottom:-span/2});camera.updateProjectionMatrix();camera.updateMatrixWorld();
  sim.bounds.x=viewWidth/2;sim.bounds.z=viewHeight/2;
  sim.target.x=THREE.MathUtils.clamp(sim.target.x,-sim.bounds.x,sim.bounds.x);sim.target.z=THREE.MathUtils.clamp(sim.target.z,-sim.bounds.z,sim.bounds.z);
  groundUniforms.worldSize.value.set(viewWidth,viewHeight);
  const k=Math.min(1,(mobileMode?320:560)/Math.max(width,height)),mw=Math.max(1,Math.round(width*k)),mh=Math.max(1,Math.round(height*k));
  if(mirror.width!==mw||mirror.height!==mh)mirror.setSize(mw,mh);groundUniforms.pixel.value.set(1/mirror.width,1/mirror.height);
  mirrorDirty=dirty=true;
}
new ResizeObserver(resize).observe(sceneEl);window.addEventListener('sh-panel-toggle',resize);
function applySettings(){
  material.color.setRGB(.026,.017,.014).multiplyScalar(settings.steelTone);material.roughness=settings.roughness;material.metalness=settings.metalness;
  gaitUniform.value=settings.legReach;
  key.intensity=settings.keyLight*settings.exposure;rim.intensity=settings.rimLight*settings.exposure;fill.intensity=.5*settings.exposure;scene.environmentIntensity=settings.environmentLight*settings.exposure;
  groundUniforms.red.value.set(settings.stageColor);groundUniforms.strength.value=settings.reflections?settings.reflection:0;groundUniforms.shade.value=settings.stageShade;groundUniforms.sheen.value=settings.sheen;groundUniforms.exposure.value=settings.exposure;shadowMaterial.uniforms.opacity.value=settings.shadowOpacity;dirty=true;resize();
}
function payload(){return {project:'iron-hunger',version:1,settings:{...settings}};}
async function copySettings(){
  const text=JSON.stringify(payload(),null,2);let copied=false;
  try{await navigator.clipboard.writeText(text);copied=true;}catch{
    const ta=document.createElement('textarea');ta.value=text;session._body.appendChild(ta);ta.select();try{copied=document.execCommand('copy');}catch{}if(copied)ta.remove();
  }
  status.textContent=copied?'Settings copied.': 'Select and copy the JSON below.';setTimeout(()=>status.textContent='',2500);
}
function reset(){Object.assign(settings,defaults);for(const [key,c]of bindings)c.setValue(settings[key]);sim.target={x:0,z:0,active:true};applySettings();sim.reset();}

function pointerWorld(e){const r=sceneEl.getBoundingClientRect();return {x:((e.clientX-r.left)/r.width-.5)*viewWidth,z:((e.clientY-r.top)/r.height-.5)*viewHeight};}
let gesture=null,twoFinger=false,holdTimer=null;const pointers=new Map();
sceneEl.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.pointerType==='mouse')return;
  e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});sceneEl.setPointerCapture(e.pointerId);
  if(pointers.size>1){twoFinger=true;clearTimeout(holdTimer);gesture=null;sim.target.active=false;return;}
  const p=pointerWorld(e);
  if(e.pointerType==='mouse'){Object.assign(sim.target,p,{active:true});sim.shock(p.x,p.z);return;}
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),dragged:false,held:false,point:p};
  // Distinguish a deliberate hold from a tap before applying attraction.
  holdTimer=setTimeout(()=>{if(gesture&&!twoFinger){gesture.held=true;Object.assign(sim.target,gesture.point,{active:true});}},160);
});
sceneEl.addEventListener('pointermove',e=>{
  if(twoFinger)return;const p=pointerWorld(e);
  if(e.pointerType==='mouse'){Object.assign(sim.target,p,{active:true});return;}
  if(gesture?.id!==e.pointerId)return;
  gesture.point=p;if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.dragged=true;
  if(gesture.dragged||gesture.held)Object.assign(sim.target,p,{active:true});
});
function endPointer(e,cancelled=false){
  clearTimeout(holdTimer);pointers.delete(e.pointerId);
  if(twoFinger){if(pointers.size===0){twoFinger=false;if(!cancelled)togglePanel();}return;}
  if(gesture?.id===e.pointerId){
    if(!cancelled&&!gesture.dragged&&!gesture.held&&performance.now()-gesture.start<300){const p=pointerWorld(e);sim.shock(p.x,p.z);}
    sim.target.active=false;gesture=null;
  }
}
sceneEl.addEventListener('pointerup',e=>endPointer(e));sceneEl.addEventListener('pointercancel',e=>endPointer(e,true));
sceneEl.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)endPointer(e,true);});
sceneEl.addEventListener('contextmenu',e=>e.preventDefault());
sceneEl.addEventListener('selectstart',e=>e.preventDefault());
sceneEl.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')sim.target.active=false;});
window.addEventListener('blur',()=>{clearTimeout(holdTimer);gesture=null;pointers.clear();twoFinger=false;sim.target.active=false;});
document.addEventListener('visibilitychange',()=>{last=lastRendered=performance.now();accumulator=0;savePrevious();dirty=true;});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;status.textContent='Graphics interrupted. Reload to resume.';});
renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
function renderMirror(now){
  if(!settings.reflections||settings.reflection===0)return;
  if(!mirrorDirty&&now-lastMirror<(mobileMode?1000/15:1000/30))return;
  mirrorCamera.copy(camera);mirrorCamera.position.y=-camera.position.y;mirrorCamera.up.set(0,0,-1);mirrorCamera.lookAt(0,0,0);mirrorCamera.updateMatrixWorld();
  reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
  ground.visible=shadows.visible=false;scene.overrideMaterial=reflectionMaterial;
  renderer.setRenderTarget(mirror);renderer.render(scene,mirrorCamera);renderer.setRenderTarget(null);
  scene.overrideMaterial=null;ground.visible=true;shadows.visible=settings.shadowOpacity>0;
  mirrorDirty=false;lastMirror=now;renderPasses++;
}
function animate(now){
  requestAnimationFrame(animate);if(contextLost||document.hidden){last=now;return;}
  if(settings.paused&&!dirty){last=lastRendered=now;return;}
  const interval=1000/settings.frameRate;
  if(!dirty&&now-lastRendered<interval-.5)return;
  const start=performance.now(),elapsed=Math.min(.067,(now-last)/1000);
  frameMs=frameMs*.94+(now-last)*.06;last=now;
  if(now-lastRendered>=interval-.5)lastRendered+=Math.max(1,Math.floor((now-lastRendered+.5)/interval))*interval;
  else lastRendered=now;
  const simStart=performance.now();
  if(!settings.paused){
    // Limit catch-up work. A delayed frame must not launch a spiral of extra work.
    accumulator=Math.min(accumulator+elapsed,physicsStep*2);
    let steps=0;while(accumulator>=physicsStep&&steps++<2){savePrevious();sim.step(physicsStep);accumulator-=physicsStep;}
  }else accumulator=0;
  simulationMs=performance.now()-simStart;
  updateInstances(settings.paused?1:accumulator/physicsStep);
  const renderStart=performance.now();renderer.info.reset();renderPasses=1;
  shadows.visible=settings.shadowOpacity>0;renderMirror(now);renderer.render(scene,camera);
  renderMs=performance.now()-renderStart;workMs=performance.now()-start;frames++;ready=true;dirty=false;
  if(settings.adaptiveResolution&&!settings.paused){
    qualityTimer+=elapsed;
    slowTime=frameMs>interval*1.35&&workMs<frameMs*.8?slowTime+elapsed:0;
    fastTime=frameMs<interval*1.15&&workMs<interval*.6?fastTime+elapsed:0;
    if(qualityTimer>1.5&&slowTime>1.2&&adaptiveScale>.7){adaptiveScale=Math.max(.7,adaptiveScale-.1);qualityTimer=slowTime=fastTime=0;resize();}
    else if(qualityTimer>5&&fastTime>4&&adaptiveScale<1){adaptiveScale=Math.min(1,adaptiveScale+.05);qualityTimer=slowTime=fastTime=0;resize();}
  }
}
window.horde={settings,defaults,payload,reset,applySettings,sim,get ready(){return ready},diagnostics:()=>({...sim.diagnostics(),ready,frames,frameMs,workMs,simulationMs,renderMs,profile:mobileMode?'Mobile':'High',simulationHz:1/physicsStep,renderPasses,adaptiveScale,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,vertices:bugs.geometry.attributes.position.count,canvas:sceneEl.getBoundingClientRect().toJSON(),panel:panelEl.getBoundingClientRect().toJSON(),pixelRatio:renderer.getPixelRatio(),reflectionSize:[mirror.width,mirror.height],gestures:{active:!!gesture,twoFinger,pointers:pointers.size}})};
applySettings();sim.reset();updateInstances();requestAnimationFrame(animate);
