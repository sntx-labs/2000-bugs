const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const defaults = {
  "count": 2000,
  "speed": 5.5,
  "urgency": 12.2,
  "scurry": 1.2,
  "separation": 0.79,
  "climbing": 1.25,
  "bugScale": 1.15,
  "legReach": 0.8,
  "legPace": 1.9,
  "paused": false,
  "seed": 8127,
  "shockStrength": 10,
  "shockRadius": 8,
  "waveSpeed": 20,
  "recovery": 0.55,
  "recoverySpread": 5.5,
  "framing": 1,
  "steelTone": 1,
  "roughness": 0.38,
  "metalness": 0.88,
  "keyLight": 3.2,
  "rimLight": 2.2,
  "environmentLight": 0.8,
  "exposure": 1,
  "stageColor": "#c81619",
  "stageShade": 0.23,
  "sheen": 0.14,
  "reflection": 0.13,
  "shadowOpacity": 0.26,
  "resolution": 1.5,
  "reflections": true,
  "quality": "Auto",
  "adaptiveResolution": true,
  "frameRate": 60
};

// Fixed-step, spatially hashed ellipsoid contacts. Leg animation is handled on the GPU.
export class Horde {
  constructor(settings, maxCount = 2000) {
    this.settings = settings; this.maxCount = maxCount;
    for (const k of ['x','y','z','vx','vy','vz','angle','roll','pitch','spinR','spinP','phase','size','stun','gait','speedNow']) this[k] = new Float32Array(maxCount);
    this.head = new Int32Array(0); this.next = new Int32Array(maxCount);
    this.activeCells = new Int32Array(maxCount); this.neighborHeads = new Int32Array(5);
    this.waves = []; this.time = 0; this.shocks = 0; this.hits = 0;
    this.bounds = { x: 16, z: 10 }; this.target = { x: 0, z: 0, active: true };
    this.reset();
  }
  random() { let t = this.rng += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  reset() {
    this.rng = this.settings.seed; this.time = 0; this.waves.length = 0; this.shocks = 0; this.hits = 0;
    for (let i = 0; i < this.maxCount; i++) {
      this.x[i] = (this.random() * 2 - 1) * this.bounds.x * .94;
      this.z[i] = (this.random() * 2 - 1) * this.bounds.z * .94;
      this.y[i] = .01; this.phase[i] = this.random() * TAU; this.size[i] = .83 + this.random() * .32;
      this.angle[i] = this.random() * TAU;
      for (const k of ['vx','vy','vz','roll','pitch','spinR','spinP','stun','gait','speedNow']) this[k][i] = 0;
    }
  }
  shock(x,z) {
    this.waves.push({ x, z, age: 0, radius: 0, hit: new Uint8Array(this.maxCount), strength: this.settings.shockStrength, reach: this.settings.shockRadius, speed: this.settings.waveSpeed });
    if (this.waves.length > 8) this.waves.shift();
    this.shocks++;
  }
  step(dt) {
    const s = this.settings, n = s.count, scale = s.bugScale;
    const personalFactor=.47*scale*s.separation,bodyFactor=.185*scale*s.separation;
    const cell=personalFactor*2.31,cols=Math.ceil(this.bounds.x*2/cell)+4,rows=Math.ceil(this.bounds.z*2/cell)+4;
    if(this.head.length!==cols*rows)this.head=new Int32Array(cols*rows);
    const head=this.head,next=this.next,activeCells=this.activeCells;
    const x=this.x,y=this.y,z=this.z,vx=this.vx,vy=this.vy,vz=this.vz,size=this.size,stun=this.stun;
    let activeCount=0;
    this.time += dt;
    for (const w of this.waves) {
      w.age += dt; w.radius = w.age * w.speed;
      for (let i=0; i<n; i++) {
        if(w.hit[i]) continue;
        const dx=this.x[i]-w.x,dz=this.z[i]-w.z,d2=dx*dx+dz*dz;
        const reach=Math.min(w.radius+.18,w.reach);
        if(d2>reach*reach)continue;
        const d=Math.sqrt(d2);
        w.hit[i]=1; this.hits++;
        const force=w.strength*(.35+.65*(1-d/w.reach)), a=d>.001?Math.atan2(dx,dz):this.phase[i];
        this.vx[i]+=Math.sin(a)*force;this.vz[i]+=Math.cos(a)*force;
        this.vy[i]=Math.max(this.vy[i],force*(.32+.18*Math.sin(this.phase[i])**2));
        this.spinR[i]=(this.phase[i]<Math.PI?-1:1)*(7+force*.7);
        this.spinP[i]=Math.cos(this.phase[i])*9;
        // Fresh individual delays on every impact, independent of distance from the
        // blast, so recovery does not trace the outgoing wave back toward the cursor.
        const delay=s.recovery+s.recoverySpread*Math.pow(this.random(),1.35);
        this.stun[i]=Math.max(this.stun[i],delay);
      }
    }
    for(let i=this.waves.length-1;i>=0;i--)if(this.waves[i].age>=this.waves[i].reach/this.waves[i].speed+.6)this.waves.splice(i,1);
    this.head.fill(-1);
    const response=1-Math.exp(-s.urgency*dt),turnResponse=1-Math.exp(-15*dt);
    const uprightDamping=Math.exp(-11*dt),slideDamping=Math.exp(-1.25*dt),spinDamping=Math.exp(-2*dt);
    for(let i=0;i<n;i++){
      this.stun[i]=Math.max(0,this.stun[i]-dt);
      const dx=this.target.x-this.x[i],dz=this.target.z-this.z[i],d=Math.sqrt(dx*dx+dz*dz);
      const sinA=d>0?dx/d:0,cosA=d>0?dz/d:1,jitter=Math.sin(this.time*(9+this.size[i]*3)+this.phase[i]);
      const dash=1+.2*Math.sin(this.time*6+this.phase[i]*3);
      const desired=s.speed*dash*(this.target.active?Math.min(1,d/.5):.13);
      const sway=jitter*s.scurry*Math.min(1,d)*.28;
      if(this.stun[i]===0){
        const tangent = this.target.active ? sway : Math.sin(this.phase[i]+this.time*.2);
        this.vx[i]+=(sinA*desired+cosA*tangent-this.vx[i])*response;
        this.vz[i]+=(cosA*desired-sinA*tangent-this.vz[i])*response;
        const face=Math.atan2(this.vx[i],this.vz[i]);
        let turn=face-this.angle[i];if(turn>Math.PI)turn-=TAU;else if(turn<-Math.PI)turn+=TAU;
        let angle=this.angle[i]+turn*turnResponse;if(angle>Math.PI)angle-=TAU;else if(angle<-Math.PI)angle+=TAU;
        this.angle[i]=angle;
        this.roll[i]*=uprightDamping;this.pitch[i]*=uprightDamping;
      }else{
        this.vx[i]*=slideDamping;this.vz[i]*=slideDamping;
        this.roll[i]+=this.spinR[i]*dt;this.pitch[i]+=this.spinP[i]*dt;
        this.spinR[i]*=spinDamping;this.spinP[i]*=spinDamping;
      }
      this.vy[i]-=12*dt;
      this.x[i]+=this.vx[i]*dt;this.z[i]+=this.vz[i]*dt;this.y[i]+=this.vy[i]*dt;
      if(this.y[i]<0){this.y[i]=0;this.vy[i]=this.stun[i]>.3?Math.abs(this.vy[i])*.24:0;}
      const bx=this.bounds.x-.22*scale,bz=this.bounds.z-.22*scale;
      if(Math.abs(this.x[i])>bx){this.x[i]=clamp(this.x[i],-bx,bx);this.vx[i]*=-.35;}
      if(Math.abs(this.z[i])>bz){this.z[i]=clamp(this.z[i],-bz,bz);this.vz[i]*=-.35;}
      this.speedNow[i]=Math.sqrt(this.vx[i]*this.vx[i]+this.vz[i]*this.vz[i]);
      this.gait[i]+=dt*(10+this.speedNow[i]*6)*s.legPace;
      const cx=Math.floor((x[i]+this.bounds.x)/cell)+1,cz=Math.floor((z[i]+this.bounds.z)/cell)+1,h=cx+cz*cols;
      if(head[h]===-1)activeCells[activeCount++]=h;
      next[i]=head[h];head[h]=i;
    }
    // Pair contacts permit vertical separation, producing real moving stacks rather than a flat flock.
    // Visit each occupied cell once and only its four forward neighbors. Each
    // pair is solved once, with no hash collisions or duplicate reverse visits.
    const neighbors=this.neighborHeads,pressure=64*dt,canClimb=s.climbing>0;
    for(let c=0;c<activeCount;c++){
      const h=activeCells[c];
      neighbors[1]=head[h+1];neighbors[2]=head[h+cols-1];neighbors[3]=head[h+cols];neighbors[4]=head[h+cols+1];
      for(let i=head[h];i!==-1;i=next[i]){
        neighbors[0]=next[i];
        for(let k=0;k<5;k++)for(let j=neighbors[k];j!==-1;j=next[j]){
          let dx=x[i]-x[j],dz=z[i]-z[j];
          const planar2=dx*dx+dz*dz,sumSize=size[i]+size[j],personal=personalFactor*sumSize;
          if(planar2>=personal*personal)continue;
          let dy=(y[i]-y[j])*2.1;
          // Anticipatory pressure remains active across layers. It keeps an arbitrarily
          // dense crowd from collapsing into one cell while feet find contacts below.
          if(planar2>1e-10&&stun[i]===0&&stun[j]===0){
            const planar=Math.sqrt(planar2),falloff=1-planar/personal;
            const force=falloff*falloff*pressure;
            const px=dx/planar*force,pz=dz/planar*force;
            vx[i]+=px;vz[i]+=pz;vx[j]-=px;vz[j]-=pz;
          }
          const radius=bodyFactor*sumSize;
          let d2=planar2+dy*dy;
          if(d2>=radius*radius)continue;
          if(d2<1e-9){dx=.001*Math.cos(this.phase[i]);dz=.001*Math.sin(this.phase[i]);d2=.000001;}
          // A small alternating shoulder contact starts a climb under crowd pressure.
          if(canClimb && Math.abs(dy)<.045*scale && stun[i]===0 && stun[j]===0){
            dy=(size[i]>size[j]?1:-1)*.08*scale*s.climbing;
            d2=dx*dx+dz*dz+dy*dy;
          }
          const d=Math.sqrt(d2),push=Math.max(0,radius-d)*.46;
          dx/=d;dz/=d;dy/=d;
          x[i]+=dx*push;z[i]+=dz*push;x[j]-=dx*push;z[j]-=dz*push;
          if(canClimb){
            const lift=dy*push/2.1;
            y[i]=Math.max(0,y[i]+lift);y[j]=Math.max(0,y[j]-lift);
            if(dy>.12)vy[i]=Math.max(vy[i],0);else if(dy<-.12)vy[j]=Math.max(vy[j],0);
          }
          const relative=(vx[i]-vx[j])*dx+(vz[i]-vz[j])*dz;
          if(relative<0){const impulse=relative*.22;vx[i]-=dx*impulse;vz[i]-=dz*impulse;vx[j]+=dx*impulse;vz[j]+=dz*impulse;}
        }
      }
    }
  }
  diagnostics(){
    let meanDistance=0,maxHeight=0,airborne=0,climbing=0,finite=true;
    for(let i=0;i<this.settings.count;i++){
      meanDistance+=Math.hypot(this.x[i]-this.target.x,this.z[i]-this.target.z);
      maxHeight=Math.max(maxHeight,this.y[i]);if(this.stun[i]>0)airborne++;if(this.y[i]>.12&&this.stun[i]===0)climbing++;
      if(!Number.isFinite(this.x[i]+this.y[i]+this.z[i]+this.roll[i]+this.pitch[i]))finite=false;
    }
    return {count:this.settings.count,time:this.time,meanDistance:meanDistance/this.settings.count,maxHeight,airborne,climbing,finite,shocks:this.shocks,hits:this.hits,target:{...this.target}};
  }
}
