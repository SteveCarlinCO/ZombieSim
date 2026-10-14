(function(){
  var cv = document.getElementById('cv10');
  var ctx = cv.getContext('2d');
  var meter = document.getElementById('meter10');
  var dotsLabel = document.getElementById('dotsLabel10');
  var statHumans = document.getElementById('statHumans');
  var statZombies = document.getElementById('statZombies');
  var statPct = document.getElementById('statPct');
  var statOdds = document.getElementById('statOdds');
  var timerEl = document.getElementById('timer10');

  function updateStats(){
    var tm = Math.floor(simT);
    // health bar: starts green, drains and shifts to blood red
    var total = parts.length;
    var infP = total > 0 ? (total - healthyN) / total : 0;
    var meter = document.getElementById('meter10');
    if (meter){
      meter.style.width = ((1 - infP) * 100).toFixed(1) + '%';
      // blue (77,166,255) -> blood red (139,0,0)
      var mr = Math.round(77 + (139 - 77) * infP);
      var mg = Math.round(166 * (1 - infP));
      var mb = Math.round(255 - 255 * infP);
      meter.style.background = 'rgb(' + mr + ',' + mg + ',' + mb + ')';
    }
    timerEl.textContent = Math.floor(tm / 60) + ':' + String(tm % 60).padStart(2, '0');
    var h = healthyN, total = parts.length;
    var z = total - h;
    statHumans.textContent = h;
    statZombies.textContent = z;
    statPct.textContent = total > 0 ? (z / total * 100).toFixed(1) + '%' : '0%';
    var odds;
    if (guess == null) odds = '\u2014';
    else if (!guessAlive) odds = '0%';
    else odds = (1 / Math.max(1, h) * 100).toFixed(2) + '%';
    statOdds.textContent = odds;
  }
  var statusEl = document.getElementById('status10');
  var guessInput = document.getElementById('guessInput10');
  var guessBtn = document.getElementById('guessBtn10');
  var dotsInput = document.getElementById('dotsInput');
  var simTitle = document.getElementById('simTitle');
  var guessLabel = document.getElementById('guessLabel');
  var oddsEl = document.getElementById('odds10');

  var H = 488, W = 300, START = 1000, FINAL = 1;
  var HEALTHY_MAX = 1.35, INFECTED_MAX = 1.22;
  var CELL = 26;
  var parts = [], bursts = [];
  var PALETTE = ['#4aa3ff','#ff6b4a','#ffd24a','#ff8ac5','#c58aff','#4adfd8'];
  var ZOMBIE = '#1e9e34', ZOMBIE_DIM = '#146327';
  var textColor = '#e8eaed', mutedColor = '#9aa0a6';
  var started = false, guess = null;
  var oddsTick = 0, simT = 0;
  var guessAlive = false, guessTurnedAt = 0, verdictShown = false, guessingClosed = false;
  var grid = {};
  var healthyN = 0;
  var bGrid = {}, BCELL = 90;
  var frameCount = 0;
  var winnerMoved = false;
  var simSpeed = 1;
  var shake = 0;
  var bloodCanvas = null, bloodCtx = null;
  var bloodOn = (function(){ try { return localStorage.getItem('zombieBlood') !== '0'; } catch(e){ return true; } })();
  var lastInfectionT = 0;

  // ==================== PROCEDURAL SOUND ENGINE ====================
  var Sound = {
    ctx: null, master: null, noiseBuf: null, on: false, muted: (function(){ try { return localStorage.getItem('zombieMuted') === '1'; } catch(e){ return false; } })(),
    nextBeat: 0, nextMoan: 0, nextRadio: 0, nextCrackle: 0, nextGlass: 0,
    droneOsc: null, droneVol: null, droneFilter: null,
    lastChirp: 0,

    init: function(){
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // shared noise buffer
      var len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
      this.on = true;
    },
    resume: function(){
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    // ---------- ambient bed ----------
    startAmbient: function(){
      var c = this.ctx, m = this.master;
      // distant siren, wailing + panning
      var sir = c.createOscillator(); sir.type = 'sine'; sir.frequency.value = 700;
      var wail = c.createOscillator(); wail.frequency.value = 0.25;
      var wailG = c.createGain(); wailG.gain.value = 250;
      wail.connect(wailG); wailG.connect(sir.frequency);
      var pan = (c.createStereoPanner ? c.createStereoPanner() : null);
      var sirVol = c.createGain(); sirVol.gain.value = 0.025;
      if (pan){
        var panLFO = c.createOscillator(); panLFO.frequency.value = 0.06;
        var panG = c.createGain(); panG.gain.value = 0.8;
        panLFO.connect(panG); panG.connect(pan.pan);
        sir.connect(pan); pan.connect(sirVol);
        panLFO.start();
      } else { sir.connect(sirVol); }
      sirVol.connect(m);
      sir.start(); wail.start();
      // low city hum
      var hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 48;
      var humF = c.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 110;
      var humV = c.createGain(); humV.gain.value = 0.018;
      hum.connect(humF); humF.connect(humV); humV.connect(m);
      hum.start();
      // wind gusts
      var wind = c.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
      var windF = c.createBiquadFilter(); windF.type = 'bandpass';
      windF.frequency.value = 350; windF.Q.value = 0.6;
      var windLFO = c.createOscillator(); windLFO.frequency.value = 0.09;
      var windG = c.createGain(); windG.gain.value = 280;
      windLFO.connect(windG); windG.connect(windF.frequency);
      var windV = c.createGain(); windV.gain.value = 0.035;
      wind.connect(windF); windF.connect(windV); windV.connect(m);
      wind.start(); windLFO.start();
      // deep drone (frenzy tension, starts silent)
      this.droneOsc = c.createOscillator(); this.droneOsc.type = 'sawtooth';
      this.droneOsc.frequency.value = 52;
      this.droneFilter = c.createBiquadFilter();
      this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 180;
      this.droneVol = c.createGain(); this.droneVol.gain.value = 0;
      this.droneOsc.connect(this.droneFilter);
      this.droneFilter.connect(this.droneVol); this.droneVol.connect(m);
      this.droneOsc.start();
      var now = c.currentTime;
      this.nextBeat = now + 0.5;
      this.nextMoan = now + 3;
      this.nextRadio = now + 6;
      this.nextCrackle = now + 1;
      this.nextGlass = now + 12;
    },

    // ---------- helpers ----------
    burst: function(dur, fType, freq, vol){
      if (!this.on) return;
      var c = this.ctx, t = c.currentTime;
      var src = c.createBufferSource(); src.buffer = this.noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      var f = c.createBiquadFilter(); f.type = fType; f.frequency.value = freq;
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    },
    tone: function(f0, f1, dur, vol, type){
      if (!this.on) return;
      var c = this.ctx, t = c.currentTime;
      var o = c.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },

    // ---------- per-frame update ----------
    update: function(){
      if (!this.on) return;
      var c = this.ctx, now = c.currentTime;
      var frac = (typeof healthyN !== 'undefined' && typeof START !== 'undefined' && START > 0)
        ? healthyN / START : 1;
      var horde = 1 - frac;
      // heartbeat quickens as humans drop
      if (now >= this.nextBeat && typeof started !== 'undefined' && started){
        var bpm = 55 + horde * 85;
        this.tone(62, 38, 0.14, 0.22);
        var self = this;
        setTimeout(function(){ if (self.on) self.tone(58, 35, 0.12, 0.16); }, 170);
        this.nextBeat = now + 60 / bpm;
      }
      // drone rises in frenzy
      if (this.droneVol){
        var target = 0, freq = 52;
        if (typeof healthyN !== 'undefined' && typeof START !== 'undefined'){
          if (healthyN <= 5){ target = 0.06; freq = 78; }
          else if (healthyN < START * 0.2){ target = 0.04; freq = 64; }
        }
        this.droneVol.gain.setTargetAtTime(target, now, 0.5);
        this.droneOsc.frequency.setTargetAtTime(freq, now, 0.5);
      }
      // distant moans, more frequent as horde grows
      if (now >= this.nextMoan && typeof started !== 'undefined' && started){
        this.moan();
        this.nextMoan = now + Math.max(1.2, 7 - horde * 6) * (0.7 + Math.random() * 0.6);
      }
      // fire crackle
      if (now >= this.nextCrackle && typeof burningBuildings !== 'undefined' && burningBuildings.length){
        this.burst(0.04 + Math.random() * 0.09, 'highpass', 1800 + Math.random() * 3500,
                   0.05 + Math.random() * 0.07);
        this.nextCrackle = now + 0.08 + Math.random() * 0.5;
      }
      // radio static bursts
      if (now >= this.nextRadio){
        this.burst(0.25 + Math.random() * 0.4, 'bandpass', 1200 + Math.random() * 800, 0.04);
        var self2 = this;
        setTimeout(function(){
          if (self2.on) self2.burst(0.15, 'bandpass', 900 + Math.random() * 500, 0.03);
        }, 300 + Math.random() * 400);
        this.nextRadio = now + 9 + Math.random() * 14;
      }
      // glass tinkles from burning buildings
      if (now >= this.nextGlass && typeof burningBuildings !== 'undefined' && burningBuildings.length){
        this.burst(0.12, 'highpass', 4000 + Math.random() * 3000, 0.05);
        this.nextGlass = now + 10 + Math.random() * 18;
      }
    },

    moan: function(){
      if (!this.on) return;
      var c = this.ctx, t = c.currentTime;
      var dur = 0.9 + Math.random() * 0.9;
      var o = c.createOscillator(); o.type = 'sawtooth';
      var f0 = 75 + Math.random() * 55;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * 0.65, t + dur);
      var vib = c.createOscillator(); vib.frequency.value = 4 + Math.random() * 4;
      var vibG = c.createGain(); vibG.gain.value = 7;
      vib.connect(vibG); vibG.connect(o.frequency);
      var fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 380;
      var g = c.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.3);
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(this.master);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    },

    // ---------- events ----------
    turn: function(){
      // sickening squelch-pop
      this.tone(280, 55, 0.28, 0.14);
      this.burst(0.12, 'lowpass', 500, 0.1);
    },
    chirp: function(){
      if (!this.on) return;
      var now = this.ctx.currentTime;
      if (now - this.lastChirp < 1.2) return;
      this.lastChirp = now;
      this.tone(950, 1400, 0.18, 0.05);
    },
    victory: function(){
      var self = this;
      [220, 277, 330, 440].forEach(function(f, i){
        setTimeout(function(){ if (self.on) self.tone(f, f * 0.99, 0.5, 0.12, 'triangle'); }, i * 160);
      });
    },
    clunk: function(){
      this.tone(130, 42, 0.16, 0.28);
      this.burst(0.06, 'lowpass', 300, 0.12);
    },
    radioClick: function(){
      this.burst(0.04, 'highpass', 2500, 0.1);
    },
    toggleMute: function(){
      this.muted = !this.muted;
      try { localStorage.setItem('zombieMuted', this.muted ? '1' : '0'); } catch(e){}
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
      return this.muted;
    }
  };
  var emergencyVehicles = [], steamVents = [], steamPuffs = [];
  var burningBuildings = [], flames = [], fireSmoke = [];

  function rebuildBuildingGrid(){
    bGrid = {};
    for (var i = 0; i < buildings.length; i++){
      var b = buildings[i];
      var x0 = Math.floor(b.x / BCELL), x1 = Math.floor((b.x + b.w) / BCELL);
      var y0 = Math.floor(b.y / BCELL), y1 = Math.floor((b.y + b.h) / BCELL);
      for (var cx = x0; cx <= x1; cx++)
        for (var cy = y0; cy <= y1; cy++){
          var k = cx + ',' + cy;
          (bGrid[k] || (bGrid[k] = [])).push(b);
        }
    }
  }
  var buildings = [];
  var streetsV = [], streetsH = [];

  function inStreet(x, y, r){
    for (var i = 0; i < streetsV.length; i++){
      var s = streetsV[i];
      if (x + r > s.x && x - r < s.x + s.w) return true;
    }
    for (var j = 0; j < streetsH.length; j++){
      var t = streetsH[j];
      if (y + r > t.y && y - r < t.y + t.h) return true;
    }
    return false;
  }

  function inBuilding(x, y, pad){
    for (var i = 0; i < buildings.length; i++){
      var b = buildings[i];
      if (x > b.x - pad && x < b.x + b.w + pad &&
          y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }

  function collideBuildings(p){
    var bcx = Math.floor(p.x / BCELL), bcy = Math.floor(p.y / BCELL);
    for (var ax = bcx - 1; ax <= bcx + 1; ax++)
      for (var ay = bcy - 1; ay <= bcy + 1; ay++){
        var cell = bGrid[ax + ',' + ay];
        if (!cell) continue;
        for (var bi = 0; bi < cell.length; bi++){
          var b = cell[bi];
          var qx = Math.max(b.x, Math.min(p.x, b.x + b.w));
          var qy = Math.max(b.y, Math.min(p.y, b.y + b.h));
      var dx = p.x - qx, dy = p.y - qy;
      var d2 = dx * dx + dy * dy;
      if (d2 >= p.r * p.r) continue;
      var nx, ny;
      if (d2 > 0.0001){
        var d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d;
      } else {
        var pl = p.x - b.x, pr = b.x + b.w - p.x;
        var pt = p.y - b.y, pb = b.y + b.h - p.y;
        var pm = Math.min(pl, pr, pt, pb);
        if (pm === pl){ nx = -1; ny = 0; }
        else if (pm === pr){ nx = 1; ny = 0; }
        else if (pm === pt){ nx = 0; ny = -1; }
        else { nx = 0; ny = 1; }
      }
      p.x = qx + nx * p.r;
      p.y = qy + ny * p.r;
      var vn = p.vx * nx + p.vy * ny;
      if (vn < 0){
        p.vx -= 1.4 * vn * nx;
        p.vy -= 1.4 * vn * ny;
        p.vx *= 0.85; p.vy *= 0.85;
      }
        }
      }
  }

  function segRect(x1, y1, x2, y2, rx, ry, rw, rh){
    var dx = x2 - x1, dy = y2 - y1;
    var tmin = 0, tmax = 1, t1, t2, tt;
    if (Math.abs(dx) < 1e-9){
      if (x1 < rx || x1 > rx + rw) return false;
    } else {
      t1 = (rx - x1) / dx; t2 = (rx + rw - x1) / dx;
      if (t1 > t2){ tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    if (Math.abs(dy) < 1e-9){
      if (y1 < ry || y1 > ry + rh) return false;
    } else {
      t1 = (ry - y1) / dy; t2 = (ry + rh - y1) / dy;
      if (t1 > t2){ tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return true;
  }

  function losBlocked(x1, y1, x2, y2){
    for (var i = 0; i < buildings.length; i++){
      var b = buildings[i];
      if (segRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  }

  function drawBuilding3D(c, x, y, w, h, dx, dy, R){
    // muted moonlight palette: unique hue per building, low saturation
    var hue = R() * 360;
    var roofC = 'hsl(' + hue.toFixed(0) + ',' + (13 + R() * 9).toFixed(0) + '%,' + (24 + R() * 7).toFixed(0) + '%)';
    var wallC = 'hsl(' + hue.toFixed(0) + ',12%,14%)';
    var wallC2 = 'hsl(' + hue.toFixed(0) + ',10%,18%)';
    // --- walls (extruded down-right) ---
    // right wall
    c.fillStyle = wallC;
    c.beginPath();
    c.moveTo(x + w, y);
    c.lineTo(x + w + dx, y + dy);
    c.lineTo(x + w + dx, y + h + dy);
    c.lineTo(x + w, y + h);
    c.closePath(); c.fill();
    // front wall
    c.fillStyle = wallC2;
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x + dx, y + h + dy);
    c.lineTo(x + w + dx, y + h + dy);
    c.lineTo(x + w, y + h);
    c.closePath(); c.fill();
    // windows on front wall
    var floors = Math.max(2, Math.round(dy / 10));
    for (var f = 0; f < floors; f++){
      var sf = (f + 0.75) / (floors + 0.4);
      var wy = y + h + sf * dy;
      var wx0 = x + sf * dx;
      var nW = Math.max(2, Math.round(w / 20));
      for (var q = 0; q < nW; q++){
        var t = (q + 0.5) / nW;
        var px = wx0 + t * w;
        if (R() < 0.28) c.fillStyle = 'rgba(210,190,130,0.4)';
        else c.fillStyle = 'rgba(10,12,16,0.7)';
        c.fillRect(px - 3.5, wy - 2.5, 7, 5);
      }
    }
    // windows on right wall (sparser)
    for (var f2 = 0; f2 < floors; f2++){
      var s2 = (f2 + 0.75) / (floors + 0.4);
      var wy2 = y + s2 * dy + h * 0.5;
      var wx2 = x + w + s2 * dx;
      if (R() < 0.28) c.fillStyle = 'rgba(210,190,130,0.32)';
      else c.fillStyle = 'rgba(10,12,16,0.55)';
      c.fillRect(wx2 - 1.5, wy2 - 8, 3, 16);
    }
    // wall/roof edge highlight
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + w, y + h); c.stroke();
    c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w, y + h); c.stroke();

    // --- roof (all existing detail) ---
    c.fillStyle = roofC;
    c.fillRect(x, y, w, h);
    var nN = (w * h / 110) | 0;
    for (var n = 0; n < nN; n++){
      c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.045)';
      c.fillRect(x + R() * w, y + R() * h, 1.6, 1.6);
    }
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,0.13)';
    c.beginPath(); c.moveTo(x + 1, y + h - 1); c.lineTo(x + 1, y + 1); c.lineTo(x + w - 1, y + 1); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.moveTo(x + w - 1, y + 1); c.lineTo(x + w - 1, y + h - 1); c.lineTo(x + 1, y + h - 1); c.stroke();
    if (w > 55 && h > 45){
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1;
      var gx, gy;
      for (gx = x + w / 3; gx < x + w - 4; gx += w / 3){
        c.beginPath(); c.moveTo(gx, y + 3); c.lineTo(gx, y + h - 3); c.stroke();
      }
      for (gy = y + h / 3; gy < y + h - 4; gy += h / 3){
        c.beginPath(); c.moveTo(x + 3, gy); c.lineTo(x + w - 3, gy); c.stroke();
      }
    }
    var nH = 1 + ((R() * Math.min(4, (w * h) / 2600)) | 0);
    for (var hi2 = 0; hi2 < nH; hi2++){
      var hs = 6 + R() * 5;
      var hx = x + 6 + R() * Math.max(1, w - hs - 12);
      var hy = y + 6 + R() * Math.max(1, h - hs - 12);
      c.fillStyle = 'rgba(0,0,0,0.32)';
      c.fillRect(hx + 1.5, hy + 2, hs, hs);
      c.fillStyle = '#5a5d60';
      c.fillRect(hx, hy, hs, hs);
      c.fillStyle = '#6e7174';
      c.fillRect(hx + 1, hy + 1, hs - 2, hs - 2);
      c.fillStyle = '#3a3d40';
      c.beginPath(); c.arc(hx + hs / 2, hy + hs / 2, hs / 2 - 1.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a2d30';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(hx + hs / 2, hy + 2); c.lineTo(hx + hs / 2, hy + hs - 2);
      c.moveTo(hx + 2, hy + hs / 2); c.lineTo(hx + hs - 2, hy + hs / 2);
      c.stroke();
    }
    var nV = (R() * 3) | 0;
    for (var vi2 = 0; vi2 < nV; vi2++){
      c.fillStyle = 'rgba(0,0,0,0.38)';
      c.fillRect(x + 5 + R() * Math.max(1, w - 12), y + 5 + R() * Math.max(1, h - 10), 3 + R() * 4, 2 + R() * 3);
    }
    if (R() < 0.35 && w > 38 && h > 32){
      var kw = 10 + R() * 8, kh = 6 + R() * 6;
      var kx = x + 8 + R() * Math.max(1, w - kw - 16);
      var ky = y + 8 + R() * Math.max(1, h - kh - 16);
      c.fillStyle = '#7a8a99';
      c.fillRect(kx, ky, kw, kh);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(kx + 1, ky + 1, kw - 2, 2);
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 1;
      c.strokeRect(kx, ky, kw, kh);
    }
    if (R() < 0.18 && w > 48 && h > 42){
      var tr = 6 + R() * 4;
      var tx = x + 12 + R() * Math.max(1, w - tr * 2 - 24);
      var ty = y + 12 + R() * Math.max(1, h - tr * 2 - 24);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.arc(tx + 2, ty + 3, tr, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5a4632';
      c.beginPath(); c.arc(tx, ty, tr, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6e5940';
      c.beginPath(); c.arc(tx - 1, ty - 1, tr - 2, 0, Math.PI * 2); c.fill();
    }
    // rooftop antenna
    if (R() < 0.4 && w > 40 && h > 36){
      var anx = x + 10 + R() * Math.max(1, w - 20);
      var any = y + 10 + R() * Math.max(1, h - 20);
      var ah = 12 + R() * 8;
      c.strokeStyle = '#151515';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(anx, any); c.lineTo(anx, any - ah); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(anx - 4, any - ah + 5); c.lineTo(anx + 4, any - ah + 5); c.stroke();
      c.beginPath(); c.moveTo(anx - 3, any - ah + 9); c.lineTo(anx + 3, any - ah + 9); c.stroke();
      c.fillStyle = '#ff3333';
      c.beginPath(); c.arc(anx, any - ah, 1.5, 0, Math.PI * 2); c.fill();
    }
    // satellite dish
    if (R() < 0.55 && w > 36 && h > 32){
      var dsx = x + 8 + R() * Math.max(1, w - 16);
      var dsy = y + 8 + R() * Math.max(1, h - 16);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.ellipse(dsx + 1.5, dsy + 2, 6.5, 4, 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5c6066';
      c.beginPath(); c.ellipse(dsx, dsy, 6.5, 4, 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#82888f';
      c.beginPath(); c.ellipse(dsx - 1.5, dsy - 1, 3.2, 2, 0.5, 0, Math.PI * 2); c.fill();
      // mount arm
      c.strokeStyle = '#3a3d42';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(dsx + 3, dsy + 2); c.lineTo(dsx + 6, dsy + 6); c.stroke();
    }
  }

  var cityBg = null;

  function drawCar(c, x, y, w, h, R, vertical){
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x + 2, y + 3, w, h);
    var colors = ['#5a5e63', '#6b4a3a', '#3a5a6b', '#555a4a', '#6b6b6b', '#4a3a5a', '#7a2a2a'];
    c.fillStyle = colors[(R() * colors.length) | 0];
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, 4);
    else c.rect(x, y, w, h);
    c.fill();
    // outline
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
    // windshield + rear window + roof highlight
    c.fillStyle = 'rgba(18,24,34,0.92)';
    if (vertical){
      c.fillRect(x + 1.5, y + 3.5, w - 3, 4);
      c.fillRect(x + 1.5, y + h - 7.5, w - 3, 3);
      c.fillStyle = 'rgba(255,255,255,0.09)';
      c.fillRect(x + 1.5, y + 9.5, w - 3, h - 19);
    } else {
      c.fillRect(x + 3.5, y + 1.5, 4, h - 3);
      c.fillRect(x + w - 7.5, y + 1.5, 3, h - 3);
      c.fillStyle = 'rgba(255,255,255,0.09)';
      c.fillRect(x + 9.5, y + 1.5, w - 19, h - 3);
    }
  }

  function buildCity(){
    cityBg = document.createElement('canvas');
    cityBg.width = Math.max(1, Math.round(W));
    cityBg.height = Math.max(1, Math.round(H));
    var c = cityBg.getContext('2d');
    var R = Math.random;
    buildings = []; streetsV = []; streetsH = [];
    // grubby concrete base
    c.fillStyle = '#242428';
    c.fillRect(0, 0, W, H);
    // large tonal patches
    var tones = ['#26262b', '#222226', '#28242a', '#232830', '#262228'];
    for (var i = 0; i < 40; i++){
      c.fillStyle = tones[(R() * tones.length) | 0];
      c.globalAlpha = 0.5;
      c.fillRect(R() * W, R() * H, 40 + R() * 120, 30 + R() * 90);
    }
    c.globalAlpha = 1;
    // street grid (stored globally for physics)
    var sx = 20 + R() * 30;
    while (sx < W - 20){
      var sw = 38 + R() * 16;
      streetsV.push({ x: sx, w: sw });
      sx += sw + 130 + R() * 90;
    }
    var sy = 15 + R() * 20;
    while (sy < H - 15){
      var sh = 36 + R() * 14;
      streetsH.push({ y: sy, h: sh });
      sy += sh + 110 + R() * 70;
    }
    c.fillStyle = '#1a1a1d';
    streetsV.forEach(function(s){ c.fillRect(s.x, 0, s.w, H); });
    streetsH.forEach(function(s){ c.fillRect(0, s.y, W, s.h); });
    // worn lane markings
    c.fillStyle = 'rgba(180,170,140,0.16)';
    streetsV.forEach(function(s){
      if (s.w < 16) return;
      var lx = s.x + s.w / 2;
      for (var y = 4; y < H; y += 18){
        if (R() < 0.3) continue;
        c.fillRect(lx - 1, y, 2, 9);
      }
    });
    streetsH.forEach(function(s){
      if (s.h < 14) return;
      var ly = s.y + s.h / 2;
      for (var x = 4; x < W; x += 18){
        if (R() < 0.3) continue;
        c.fillRect(x, ly - 1, 9, 2);
      }
    });
    // buildings in the blocks between streets
    var vEdges = [0], hEdges = [0];
    streetsV.forEach(function(s){ vEdges.push(s.x, s.x + s.w); });
    vEdges.push(W);
    streetsH.forEach(function(s){ hEdges.push(s.y, s.y + s.h); });
    hEdges.push(H);
    for (var vi = 0; vi < vEdges.length - 1; vi += 2){
      for (var hi = 0; hi < hEdges.length - 1; hi += 2){
        var bw = vEdges[vi + 1] - vEdges[vi];
        var bh = hEdges[hi + 1] - hEdges[hi];
        if (bw < 55 || bh < 48) continue;
        // 1-4 buildings per block depending on block size
        var cols = bw > 150 ? 2 : 1;
        var rows = bh > 120 ? 2 : 1;
        for (var bi = 0; bi < cols; bi++){
          for (var bj = 0; bj < rows; bj++){
            var cw = bw / cols, ch = bh / rows;
            var bhgt = 14 + R() * 26;
            var bdx = bhgt * 0.42, bdy = bhgt * 0.72;
            // fit the full 3D footprint (roof + walls) inside the cell — never touch a street
            var maxW = cw - bdx - 6, maxH = ch - bdy - 6;
            var bww = Math.min(cw * (0.52 + R() * 0.22), maxW);
            var bhh = Math.min(ch * (0.52 + R() * 0.22), maxH);
            if (bww < 20 || bhh < 16) continue;
            var x0 = vEdges[vi] + bi * cw, y0 = hEdges[hi] + bj * ch;
            var bwx = Math.max(x0 + 3, Math.min(x0 + cw - bww - bdx - 3, x0 + (cw - bww - bdx) / 2));
            var bwy = Math.max(y0 + 3, Math.min(y0 + ch - bhh - bdy - 3, y0 + (ch - bhh - bdy) / 2));
            // lighter gray ground around the building
            c.fillStyle = '#33302b';
            c.fillRect(bwx - 6, bwy - 6, bww + bdx + 12, bhh + bdy + 12);
            drawBuilding3D(c, bwx, bwy, bww, bhh, bdx, bdy, R);
            buildings.push({ x: bwx, y: bwy, w: bww + bdx, h: bhh + bdy, rw: bww, rh: bhh });
          }
        }
      }
    }
    // 5 parked cars on the streets (solid obstacles, block line-of-sight)
    var carsPlaced = 0, carTries = 0;
    while (carsPlaced < 20 && carTries < 400){
      carTries++;
      var cVert = Math.random() < 0.5;
      var cw, ch, cx, cy;
      if (cVert && streetsV.length){
        var csv = streetsV[(Math.random() * streetsV.length) | 0];
        cw = 10; ch = 22;
        cx = csv.x + (Math.random() < 0.5 ? 2 : csv.w - cw - 2);
        cy = 10 + Math.random() * Math.max(1, H - ch - 20);
      } else if (!cVert && streetsH.length){
        var csh = streetsH[(Math.random() * streetsH.length) | 0];
        cw = 22; ch = 10;
        cx = 10 + Math.random() * Math.max(1, W - cw - 20);
        cy = csh.y + (Math.random() < 0.5 ? 2 : csh.h - ch - 2);
      } else continue;
      var cok = true;
      for (var cbi = 0; cbi < buildings.length; cbi++){
        var cb = buildings[cbi];
        if (cx < cb.x + cb.w + 6 && cx + cw + 6 > cb.x &&
            cy < cb.y + cb.h + 6 && cy + ch + 6 > cb.y){ cok = false; break; }
      }
      if (!cok) continue;
      drawCar(c, cx, cy, cw, ch, R, cVert);
      buildings.push({ x: cx, y: cy, w: cw, h: ch, isCar: true });
      carsPlaced++;
    }

    // street lights: warm pools marking the night streets
    function drawLamp(lx, ly){
      var lg = c.createRadialGradient(lx, ly, 2, lx, ly, 32);
      lg.addColorStop(0, 'rgba(255,190,90,0.30)');
      lg.addColorStop(0.5, 'rgba(255,170,70,0.13)');
      lg.addColorStop(1, 'rgba(255,160,60,0)');
      c.fillStyle = lg;
      c.beginPath();
      c.arc(lx, ly, 32, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(lx - 1, ly + 2, 2, 7);
      c.fillStyle = '#ffe9b0';
      c.beginPath();
      c.arc(lx, ly, 2.6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,220,140,0.85)';
      c.beginPath();
      c.arc(lx, ly, 1.2, 0, Math.PI * 2);
      c.fill();
    }
    streetsV.forEach(function(s){
      var lx = (Math.random() < 0.5 ? s.x + 4 : s.x + s.w - 4);
      for (var ly = 25; ly < H - 10; ly += 75 + Math.random() * 35) drawLamp(lx, ly);
    });
    streetsH.forEach(function(s){
      var ly2 = (Math.random() < 0.5 ? s.y + 4 : s.y + s.h - 4);
      for (var lx2 = 25; lx2 < W - 10; lx2 += 75 + Math.random() * 35) drawLamp(lx2, ly2);
    });

    // trees on sidewalks: canopies kept fully off the street
    for (var tri = 0; tri < 160; tri++){
      var trr = 5 + Math.random() * 4;
      var trx, try_;
      if (Math.random() < 0.5 && streetsV.length){
        var trv = streetsV[(Math.random() * streetsV.length) | 0];
        trx = (Math.random() < 0.5 ? trv.x - trr - 3 : trv.x + trv.w + trr + 3);
        try_ = 12 + Math.random() * Math.max(1, H - 24);
      } else if (streetsH.length){
        var trh = streetsH[(Math.random() * streetsH.length) | 0];
        trx = 12 + Math.random() * Math.max(1, W - 24);
        try_ = (Math.random() < 0.5 ? trh.y - trr - 3 : trh.y + trh.h + trr + 3);
      } else continue;
      // skip if inside a building, off the map, or touching any street
      if (trx - trr < 0 || trx + trr > W || try_ - trr < 0 || try_ + trr > H) continue;
      if (inBuilding(trx, try_, trr + 2)) continue;
      if (inStreet(trx, try_, trr)) continue;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath(); c.arc(trx + 1.5, try_ + 2, trr, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1e3d1e';
      c.beginPath(); c.arc(trx, try_, trr, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a522a';
      c.beginPath(); c.arc(trx - trr * 0.25, try_ - trr * 0.25, trr * 0.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a6a35';
      for (var trl = 0; trl < 4; trl++){
        c.beginPath();
        c.arc(trx + (Math.random() - 0.5) * trr, try_ + (Math.random() - 0.5) * trr,
              1.2 + Math.random() * 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }

    // manholes: subtle dark circles on streets
    for (var mhi = 0; mhi < 12; mhi++){
      var mhx, mhy;
      if (Math.random() < 0.5 && streetsV.length){
        var msv = streetsV[(Math.random() * streetsV.length) | 0];
        mhx = msv.x + msv.w / 2; mhy = Math.random() * H;
      } else if (streetsH.length){
        var msh = streetsH[(Math.random() * streetsH.length) | 0];
        mhx = Math.random() * W; mhy = msh.y + msh.h / 2;
      } else continue;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.beginPath(); c.arc(mhx, mhy, 3.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(mhx, mhy, 3.2, 0, Math.PI * 2); c.stroke();
    }

    // puddles: reflective patches catching streetlight glow
    for (var pdi = 0; pdi < 9; pdi++){
      var pdx, pdy;
      if (Math.random() < 0.5 && streetsV.length){
        var psv = streetsV[(Math.random() * streetsV.length) | 0];
        pdx = psv.x + 6 + Math.random() * Math.max(1, psv.w - 12);
        pdy = Math.random() * H;
      } else if (streetsH.length){
        var psh = streetsH[(Math.random() * streetsH.length) | 0];
        pdx = Math.random() * W;
        pdy = psh.y + 6 + Math.random() * Math.max(1, psh.h - 12);
      } else continue;
      var pdw = 14 + Math.random() * 22, pdh = 7 + Math.random() * 10;
      var pdg = c.createRadialGradient(pdx, pdy, 1, pdx, pdy, pdw / 2);
      pdg.addColorStop(0, 'rgba(130,160,190,0.38)');
      pdg.addColorStop(0.7, 'rgba(120,150,180,0.18)');
      pdg.addColorStop(1, 'rgba(120,150,180,0)');
      c.fillStyle = pdg;
      c.beginPath();
      c.ellipse(pdx, pdy, pdw / 2, pdh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }

    // abandoned barricades: knocked-over striped barriers
    for (var bci = 0; bci < 7; bci++){
      var bcx, bcy;
      if (Math.random() < 0.5 && streetsV.length){
        var bsv = streetsV[(Math.random() * streetsV.length) | 0];
        bcx = bsv.x + 5 + Math.random() * Math.max(1, bsv.w - 10);
        bcy = Math.random() * H;
      } else if (streetsH.length){
        var bsh = streetsH[(Math.random() * streetsH.length) | 0];
        bcx = Math.random() * W;
        bcy = bsh.y + 5 + Math.random() * Math.max(1, bsh.h - 10);
      } else continue;
      c.save();
      c.translate(bcx, bcy);
      c.rotate(Math.random() * Math.PI);
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(-11, 0, 24, 5);
      c.fillStyle = '#c8551e';
      c.fillRect(-12, -3, 24, 4);
      c.fillStyle = '#d8d8d2';
      c.fillRect(-8, -3, 4, 4); c.fillRect(0, -3, 4, 4); c.fillRect(8, -3, 2, 4);
      c.fillStyle = '#2a2a2a';
      c.fillRect(-10, -5, 2, 9); c.fillRect(8, -5, 2, 9);
      c.restore();
    }
    // traffic cones scattered
    for (var tci = 0; tci < 14; tci++){
      var tcx, tcy;
      if (Math.random() < 0.5 && streetsV.length){
        var tsv = streetsV[(Math.random() * streetsV.length) | 0];
        tcx = tsv.x + 4 + Math.random() * Math.max(1, tsv.w - 8);
        tcy = Math.random() * H;
      } else if (streetsH.length){
        var tsh = streetsH[(Math.random() * streetsH.length) | 0];
        tcx = Math.random() * W;
        tcy = tsh.y + 4 + Math.random() * Math.max(1, tsh.h - 8);
      } else continue;
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.arc(tcx + 1, tcy + 2, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d8621e';
      c.beginPath();
      c.moveTo(tcx, tcy - 4); c.lineTo(tcx - 3, tcy + 2); c.lineTo(tcx + 3, tcy + 2);
      c.closePath(); c.fill();
      c.fillStyle = '#e8e8e2';
      c.fillRect(tcx - 2, tcy - 1, 4, 1.5);
    }

    // bus stop shelters
    for (var bsi = 0; bsi < 3; bsi++){
      var bsx, bsy, bshoriz = Math.random() < 0.5;
      if (streetsV.length && (bshoriz || !streetsH.length)){
        var bsv2 = streetsV[(Math.random() * streetsV.length) | 0];
        bsx = (Math.random() < 0.5 ? bsv2.x - 2 : bsv2.x + bsv2.w - 12);
        bsy = 20 + Math.random() * Math.max(1, H - 40);
      } else if (streetsH.length){
        var bsh2 = streetsH[(Math.random() * streetsH.length) | 0];
        bsx = 20 + Math.random() * Math.max(1, W - 40);
        bsy = (Math.random() < 0.5 ? bsh2.y - 2 : bsh2.y + bsh2.h - 4);
      } else continue;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(bsx + 1, bsy + 2, 15, 7);
      c.fillStyle = '#2e4a62';
      c.fillRect(bsx, bsy, 15, 3);
      c.fillStyle = 'rgba(140,170,195,0.35)';
      c.fillRect(bsx + 1, bsy + 3, 13, 4);
      c.fillStyle = '#1c1c1c';
      c.fillRect(bsx + 1, bsy + 3, 1.5, 4); c.fillRect(bsx + 12.5, bsy + 3, 1.5, 4);
    }

    // dumpsters tucked behind buildings
    for (var dmi = 0; dmi < 5; dmi++){
      var db = buildings[(Math.random() * buildings.length) | 0];
      if (!db || db.isCar) continue;
      var dmx = db.x + db.w + 2, dmy = db.y + db.h - 9;
      if (dmx + 9 > W) dmx = db.x - 11;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(dmx + 1, dmy + 1.5, 9, 7);
      c.fillStyle = '#27402a';
      c.fillRect(dmx, dmy, 9, 7);
      c.fillStyle = '#3a5c3e';
      c.fillRect(dmx, dmy, 9, 2.5);
    }

    // emergency vehicles (bodies static; light bars flash per-frame)
    emergencyVehicles = [];
    steamVents = []; steamPuffs = [];
    for (var evi = 0; evi < 2; evi++){
      var evv = Math.random() < 0.5, evx, evy, evw, evh;
      if (evv && streetsV.length){
        var evs = streetsV[(Math.random() * streetsV.length) | 0];
        evw = 11; evh = 24;
        evx = evs.x + (evs.w - evw) / 2;
        evy = 20 + Math.random() * Math.max(1, H - evh - 40);
      } else if (streetsH.length){
        var evs2 = streetsH[(Math.random() * streetsH.length) | 0];
        evw = 24; evh = 11;
        evx = 20 + Math.random() * Math.max(1, W - evw - 40);
        evy = evs2.y + (evs2.h - evh) / 2;
      } else continue;
      var evType = Math.random() < 0.5 ? 'police' : 'ambulance';
      // body
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(evx + 2, evy + 3, evw, evh);
      if (evType === 'police'){
        c.fillStyle = '#1a1d22';
        c.beginPath();
        if (c.roundRect) c.roundRect(evx, evy, evw, evh, 3); else c.rect(evx, evy, evw, evh);
        c.fill();
        c.fillStyle = '#d8dce2';
        if (evv) c.fillRect(evx + 1.5, evy + evh * 0.35, evw - 3, evh * 0.3);
        else c.fillRect(evx + evw * 0.35, evy + 1.5, evw * 0.3, evh - 3);
      } else {
        c.fillStyle = '#d5d8dc';
        c.beginPath();
        if (c.roundRect) c.roundRect(evx, evy, evw, evh, 3); else c.rect(evx, evy, evw, evh);
        c.fill();
        c.fillStyle = '#8b0000';
        var crx = evx + evw / 2, cry = evy + evh / 2;
        c.fillRect(crx - 4, cry - 1.2, 8, 2.4);
        c.fillRect(crx - 1.2, cry - 4, 2.4, 8);
      }
      // windshield
      c.fillStyle = 'rgba(18,24,34,0.9)';
      if (evv){ c.fillRect(evx + 2, evy + 3, evw - 4, 4); c.fillRect(evx + 2, evy + evh - 7, evw - 4, 3); }
      else { c.fillRect(evx + 3, evy + 2, 4, evh - 4); c.fillRect(evx + evw - 7, evy + 2, 3, evh - 4); }
      emergencyVehicles.push({ x: evx, y: evy, w: evw, h: evh, v: evv, phase: Math.random() * 6.28 });
      buildings.push({ x: evx, y: evy, w: evw, h: evh, isCar: true });
    }

    // steam vents on rooftops
    for (var svi = 0; svi < 6; svi++){
      var svb = buildings[(Math.random() * buildings.length) | 0];
      if (!svb || svb.isCar) continue;
      steamVents.push({ x: svb.x + svb.w * (0.3 + Math.random() * 0.4),
                        y: svb.y + svb.h * (0.3 + Math.random() * 0.4) });
    }

    // 3 burning buildings: charred roofs, flames + smoke per-frame
    burningBuildings = [];
    var bCount = 0, bTries = 0;
    while (bCount < 3 && bTries < 60){
      bTries++;
      var bb = buildings[(Math.random() * buildings.length) | 0];
      if (!bb || bb.isCar || bb.burning) continue;
      bb.burning = true;
      // char the roof
      c.fillStyle = 'rgba(10,8,6,0.55)';
      c.fillRect(bb.x, bb.y, bb.w - bb.w * 0.3, bb.h - bb.h * 0.3);
      // glowing embers on roof
      for (var em = 0; em < 8; em++){
        c.fillStyle = R() < 0.5 ? 'rgba(255,120,20,0.8)' : 'rgba(255,200,60,0.7)';
        c.beginPath();
        c.arc(bb.x + R() * bb.w * 0.7, bb.y + R() * bb.h * 0.7, 1.5 + R() * 2, 0, Math.PI * 2);
        c.fill();
      }
      burningBuildings.push({ x: bb.x + bb.w * 0.4, y: bb.y + bb.h * 0.4,
                              w: bb.w * 0.49, h: bb.h * 0.49 });
      bCount++;
    }
    flames = []; fireSmoke = [];

    // grime
    for (var g = 0; g < 250; g++){
      c.fillStyle = 'rgba(0,0,0,' + (0.04 + R() * 0.1).toFixed(2) + ')';
      c.beginPath();
      c.arc(R() * W, R() * H, 2 + R() * 12, 0, Math.PI * 2);
      c.fill();
    }
    for (var st = 0; st < 40; st++){
      c.fillStyle = R() < 0.5 ? 'rgba(90,58,40,0.08)' : 'rgba(58,74,46,0.08)';
      c.beginPath();
      c.arc(R() * W, R() * H, 4 + R() * 16, 0, Math.PI * 2);
      c.fill();
    }
    // vignette
    var vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    // brighten the whole background 25% (baked once)
    var bright = document.createElement('canvas');
    bright.width = cityBg.width;
    bright.height = cityBg.height;
    var bc = bright.getContext('2d');
    if (bc.filter !== undefined){
      bc.filter = 'brightness(1.25)';
      bc.drawImage(cityBg, 0, 0);
      cityBg = bright;
    }
  }

  function resize(){
    var r = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    W = Math.max(60, r.width);
    H = Math.max(60, r.height);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function healthyCount(){ return healthyN; }

  function reset(){
    parts = []; bursts = []; grid = {};
    started = false; guess = null;
    verdictShown = false; guessingClosed = false;
    guessAlive = false; guessTurnedAt = 0;
    simT = 0; oddsTick = 0; healthyN = 0; winnerMoved = false; lastInfectionT = 0;
    oddsEl.textContent = '';
    var want = parseInt(dotsInput.value, 10);
    if (isNaN(want)) want = 1000;
    START = Math.max(2, Math.min(1000, want));
    dotsInput.value = START;
    guessInput.max = START;
    guessInput.placeholder = 'e.g. ' + Math.min(437, START);
    simTitle.textContent = 'ZOMBIE OUTBREAK SIMULATION';
    guessLabel.innerHTML = 'Your pick (1&ndash;' + START + '):';
    buildCity();
    rebuildBuildingGrid();
    // show the empty city first — dots land on the next paint
    ctx.clearRect(0, 0, W, H);
    if (cityBg) ctx.drawImage(cityBg, 0, 0, W, H);
    bloodCanvas = document.createElement('canvas');
    bloodCanvas.width = W; bloodCanvas.height = H;
    bloodCtx = bloodCanvas.getContext('2d');
    var m = 14;
    for (var i = 0; i < START; i++){
      var x, y, wt = 0;
      do {
        x = m + Math.random() * Math.max(1, W - 2 * m);
        y = m + Math.random() * Math.max(1, H - 2 * m);
        wt++;
      } while (inBuilding(x, y, 12) && wt < 25);
      var a = Math.random() * Math.PI * 2;
      var sp = 0.5 + Math.random() * 0.8;
      parts.push({
        num: i + 1,
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 4.2 + Math.random() * 2.6,
        c: PALETTE[i % PALETTE.length],
        infected: false,
        flash: 0,
        incubate: 0,
        expose: 0
      });
    }
    healthyN = parts.length;
    // patient zero
    var pz = parts[Math.floor(Math.random() * parts.length)];
    pz.infected = true;
    pz.flash = 1;
    pz.incubate = 0;
    healthyN--;
    rebuildGrid();
    guessInput.disabled = false;
    guessBtn.disabled = false;
    guessInput.style.opacity = '1';
    guessBtn.style.opacity = '1';
    guessBtn.textContent = 'Lock in guess & start';
    updateStatus();
    updateStats();
  }

  function rebuildGrid(){
    grid = {};
    for (var i = 0; i < parts.length; i++){
      var p = parts[i];
      var k = Math.floor(p.x / CELL) + ',' + Math.floor(p.y / CELL);
      (grid[k] || (grid[k] = [])).push(p);
    }
  }

  function eachNeighbor(p, fn){
    var cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    for (var ax = cx - 1; ax <= cx + 1; ax++){
      for (var ay = cy - 1; ay <= cy + 1; ay++){
        var cell = grid[ax + ',' + ay];
        if (cell) for (var i = 0; i < cell.length; i++) fn(cell[i]);
      }
    }
  }

  function lockGuess(){
    var val = parseInt(guessInput.value, 10);
    if (isNaN(val) || val < 1 || val > START){
      statusEl.textContent = 'Pick a number between 1 and ' + START + ' first.';
      return;
    }
    if (guess === val && started) return;
    guess = val; guessAlive = true; guessTurnedAt = 0;
    // check if the pick is already patient zero
    for (var i = 0; i < parts.length; i++){
      if (parts[i].num === val && parts[i].infected){
        guessAlive = false; guessTurnedAt = parts.length;
      }
    }
    if (!started){ started = true; }
    Sound.clunk();
    updateStatus();
  }

  function updateStatus(){
    var h = healthyCount();
    meter.style.width = (100 * (h - FINAL) / Math.max(1, START - FINAL)) + '%';
    dotsLabel.textContent = 'healthy: ' + h;
    if (!started){
      statusEl.textContent = 'Patient zero is out there. Lock in your guess before the outbreak begins.';
      return;
    }
    if (h === FINAL && !verdictShown){
      verdictShown = true;
      var w = null;
      for (var i = 0; i < parts.length; i++) if (!parts[i].infected){ w = parts[i]; break; }
      if (guess != null && w && w.num === guess){
        statusEl.textContent = 'HUMAN #' + w.num + ' IS THE LAST HUMAN STANDING. Your pick survived — nailed it.';
      } else if (guess != null){
        statusEl.textContent = 'HUMAN #' + w.num + ' IS THE LAST HUMAN STANDING. Your pick (#' + guess + ') turned with ' + guessTurnedAt + ' healthy left.';
      } else {
        statusEl.textContent = 'HUMAN #' + w.num + ' IS THE LAST HUMAN STANDING.';
      }
      guessBtn.disabled = true;
      guessBtn.style.opacity = '0.5';
      return;
    }
    if (guess == null){
      statusEl.textContent = h + ' healthy humans remain.';
      return;
    }
    if (!guessAlive){
      statusEl.textContent = 'Your pick (#' + guess + ') turned with ' + guessTurnedAt + ' healthy left.' +
        (h === FINAL ? '' : ' ' + h + ' still human.');
      return;
    }
    var closeAt = Math.max(FINAL + 1, Math.min(10, Math.ceil(START * 0.25)));
    statusEl.textContent = 'Your pick: #' + guess + ' — still human.' +
      (guessingClosed ? ' (guessing closed)' : ' (you can change it until ' + closeAt + ' remain)');
  }

  function updateOdds(){
    var h = healthyCount();
    if (!started || h <= FINAL){ oddsEl.textContent = ''; return; }
    // isolation = distance to nearest infected; most isolated = safest
    var scored = [];
    for (var i = 0; i < parts.length; i++){
      var p = parts[i];
      if (p.infected) continue;
      var best = 1e9, bq = null;
      eachNeighbor(p, function(q){
        if (!q.infected || q === p) return;
        var dx = p.x - q.x, dy = p.y - q.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < best){ best = d2; bq = q; }
      });
      var iso = Math.sqrt(best);
      if (bq && losBlocked(p.x, p.y, bq.x, bq.y)) iso += 150; // hiding behind cover
      scored.push({ num: p.num, iso: iso });
    }
    scored.sort(function(a, b){ return b.iso - a.iso; });
    var top = scored.slice(0, 5);
    oddsEl.textContent = 'MOST ISOLATED: ' + top.map(function(t){
      return '#' + t.num + ((guess != null && t.num === guess) ? ' \u25C4 YOU' : '');
    }).join(' \u00B7 ');
  }

  function frame(){
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.2){
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    } else shake = 0;
    if (cityBg) ctx.drawImage(cityBg, 0, 0, W, H);
    if (bloodCanvas) ctx.drawImage(bloodCanvas, 0, 0, W, H);
    if (started && healthyN > FINAL) simT += 1 / 60;

    for (var spd = 0; spd < simSpeed && started && healthyN > FINAL; spd++){
      // the horde accelerates as it grows — endgame never drags
      var infectedN = parts.length - healthyN;
      var stallBoost = (simT - lastInfectionT > 30) ? 2 : 1;
      var zMax = (INFECTED_MAX + Math.min(0.6, infectedN * 0.0008)) * stallBoost;
      // frenzy: below 20% survivors 2x; at 5 or fewer, 4x (100% more)
      var frenzy = 1;
      if (healthyN <= 5) frenzy = 4;
      else if (healthyN < START * 0.2) frenzy = 2;
      rebuildGrid();
      // single pass: one neighbor scan per dot drives AI + infection
      var toInfect = [];
      for (var i = 0; i < parts.length; i++){
        var p = parts[i];
        var best = null, bd = 1e9;       // infected: nearest healthy
        var threat = null, td = 6400;    // healthy: nearest infected (80px)
        var touching = false;
        if (p.infected){
          eachNeighbor(p, function(q){
            if (q.infected || q === p) return;
            var dx = q.x - p.x, dy = q.y - p.y;
            var d2 = dx * dx + dy * dy;
            if (d2 < bd){ bd = d2; best = q; }
          });
          if (best){
            var d = Math.sqrt(bd) || 1;
            p.vx += (best.x - p.x) / d * 0.14 * frenzy;
            p.vy += (best.y - p.y) / d * 0.14 * frenzy;
          } else {
            p.vx += (Math.random() - 0.5) * 0.12;
            p.vy += (Math.random() - 0.5) * 0.12;
          }
          if (p.incubate > 0) p.incubate--;
          var pMax = zMax;
          if (p.runner){
            if (p.runnerT > 0){ pMax = zMax * 2; p.runnerT--; }
            else pMax = zMax * 0.8;
          }
          var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (sp > pMax){ p.vx *= pMax / sp; p.vy *= pMax / sp; }
        } else {
          eachNeighbor(p, function(q){
            if (!q.infected || q === p) return;
            var dx = p.x - q.x, dy = p.y - q.y;
            var d2 = dx * dx + dy * dy;
            if (d2 < td){ td = d2; threat = q; }
            if (!touching && q.incubate <= 0){
              var rr = p.r + q.r + 1;
              if (d2 < rr * rr && !losBlocked(p.x, p.y, q.x, q.y)) touching = true;
            }
          });
          if (threat){
            var td2 = Math.sqrt(td) || 1;
            p.vx += (p.x - threat.x) / td2 * 0.18;
            p.vy += (p.y - threat.y) / td2 * 0.18;
          }
          p.vx += (Math.random() - 0.5) * 0.09;
          p.vy += (Math.random() - 0.5) * 0.09;
          p.vx *= 0.99; p.vy *= 0.99;
          var hMax = threat ? HEALTHY_MAX * 1.5 : HEALTHY_MAX; // adrenaline when a zombie is near
          var sp2 = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (sp2 > hMax){ p.vx *= hMax / sp2; p.vy *= hMax / sp2; }
          // sustained contact infects; breaking away clears exposure
          if (touching) p.expose++;
          else p.expose = Math.max(0, p.expose - 3);
          if (p.expose >= 40){ toInfect.push(p); p.expose = 0; }
        }
        p.x += p.vx; p.y += p.vy;
        collideBuildings(p);
        if (p.x < p.r){ p.x = p.r; p.vx = Math.abs(p.vx); }
        if (p.x > W - p.r){ p.x = W - p.r; p.vx = -Math.abs(p.vx); }
        if (p.y < p.r){ p.y = p.r; p.vy = Math.abs(p.vy); }
        if (p.y > H - p.r){ p.y = H - p.r; p.vy = -Math.abs(p.vy); }
        if (p.flash > 0) p.flash = Math.max(0, p.flash - 0.04);
      }
      // never wipe out the last human in one frame
      if (healthyN - toInfect.length < FINAL && toInfect.length > 0){
        toInfect.length = Math.max(0, healthyN - FINAL);
      }
      for (var k = 0; k < toInfect.length; k++){
        var ip = toInfect[k];
        ip.infected = true;
        ip.flash = 1;
        ip.incubate = 240;
        healthyN--;
        if (Math.random() < 0.05){ ip.runner = true; ip.runnerT = 600; }
        if (bloodOn && bloodCtx){
          for (var spl = 0; spl < 5; spl++){
            var spx = ip.x + (Math.random() - 0.5) * 14;
            var spy = ip.y + (Math.random() - 0.5) * 14;
            if (inBuilding(spx, spy, 3)) continue; // never on buildings
            bloodCtx.fillStyle = 'rgba(120,10,10,' + (0.12 + Math.random() * 0.08).toFixed(2) + ')';
            bloodCtx.beginPath();
            bloodCtx.arc(spx, spy, 2 + Math.random() * 4, 0, Math.PI * 2);
            bloodCtx.fill();
          }
        }
        bursts.push({ x: ip.x, y: ip.y, r: 5, life: 1 });
        if (guess != null && guessAlive && ip.num === guess){
          guessAlive = false;
          guessTurnedAt = healthyCount();
        }
      }
      if (toInfect.length){
        lastInfectionT = simT;
        updateStatus(); Sound.turn();
        if (toInfect.length >= 10) shake = Math.min(12, 4 + toInfect.length * 0.3);
      }

      var closeAt = Math.max(FINAL + 1, Math.min(10, Math.ceil(START * 0.25)));
      if (!guessingClosed && healthyCount() <= closeAt && healthyCount() > FINAL){
        guessingClosed = true;
        guessInput.disabled = true;
        guessBtn.disabled = true;
        guessInput.style.opacity = '0.5';
        guessBtn.style.opacity = '0.5';
        updateStatus();
      }
      if (healthyCount() === FINAL && !verdictShown){ updateStatus(); Sound.victory(); }
    }

    // --- emergency vehicle light bars (flashing red/blue) ---
    for (var ev = 0; ev < emergencyVehicles.length; ev++){
      var evh2 = emergencyVehicles[ev];
      var redPhase = Math.sin(simT * 0.35 + evh2.phase) > 0;
      var lx = evh2.x + evh2.w / 2, ly = evh2.y + evh2.h / 2;
      var glowC = redPhase ? '255,40,40' : '40,80,255';
      var lg2 = ctx.createRadialGradient(lx, ly, 1, lx, ly, 22);
      lg2.addColorStop(0, 'rgba(' + glowC + ',0.55)');
      lg2.addColorStop(1, 'rgba(' + glowC + ',0)');
      ctx.fillStyle = lg2;
      ctx.beginPath(); ctx.arc(lx, ly, 22, 0, Math.PI * 2); ctx.fill();
      if (redPhase !== evh2._lastPhase){ Sound.chirp(); evh2._lastPhase = redPhase; }
      // light bar
      ctx.fillStyle = redPhase ? '#ff2a2a' : '#2a5aff';
      if (evh2.v) ctx.fillRect(lx - 4, ly - 1.5, 8, 3);
      else ctx.fillRect(lx - 1.5, ly - 4, 3, 8);
      ctx.fillStyle = redPhase ? '#2a5aff' : '#ff2a2a';
      if (evh2.v){ ctx.fillRect(lx - 4, ly - 1.5, 3.5, 3); }
      else { ctx.fillRect(lx - 1.5, ly - 4, 3, 3.5); }
    }

    // --- burning buildings: flames + smoke ---
    for (var bbi = 0; bbi < burningBuildings.length; bbi++){
      var brn = burningBuildings[bbi];
      // spawn flames
      for (var fs = 0; fs < 3; fs++){
        flames.push({
          x: brn.x + Math.random() * brn.w,
          y: brn.y + Math.random() * brn.h,
          vx: (Math.random() - 0.5) * 0.32,
          vy: -(0.48 + Math.random() * 0.6),
          life: 1, r: (3 + Math.random() * 4) * 0.7
        });
      }
      // spawn smoke
      if (Math.random() < 0.49){
        fireSmoke.push({
          x: brn.x + brn.w / 2 + (Math.random() - 0.5) * 10,
          y: brn.y,
          vx: (Math.random() - 0.5) * 0.2,
          vy: -(0.24 + Math.random() * 0.24),
          life: 1, r: 5 + Math.random() * 5
        });
      }
      // ambient glow on the rooftop
      var flick = 0.35 + Math.random() * 0.15;
      var fg = ctx.createRadialGradient(brn.x + brn.w/2, brn.y + brn.h/2, 2,
                                        brn.x + brn.w/2, brn.y + brn.h/2, brn.w);
      fg.addColorStop(0, 'rgba(255,120,20,' + flick.toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(brn.x + brn.w/2, brn.y + brn.h/2, brn.w, 0, Math.PI * 2);
      ctx.fill();
    }
    // update flames
    for (var fli = flames.length - 1; fli >= 0; fli--){
      var fl = flames[fli];
      fl.x += fl.vx + (Math.random() - 0.5) * 1.2;
      fl.y += fl.vy;
      fl.life -= 0.016; fl.r *= 0.984;
      if (fl.life <= 0){ flames.splice(fli, 1); continue; }
      var fc = fl.life > 0.6 ? '255,220,80' : (fl.life > 0.3 ? '255,140,30' : '200,60,15');
      ctx.fillStyle = 'rgba(' + fc + ',' + (fl.life * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2); ctx.fill();
    }
    // update fire smoke (dark, rises high)
    for (var fsi = fireSmoke.length - 1; fsi >= 0; fsi--){
      var fsm = fireSmoke[fsi];
      fsm.x += fsm.vx; fsm.y += fsm.vy;
      fsm.life -= 0.0032; fsm.r += 0.14;
      if (fsm.life <= 0){ fireSmoke.splice(fsi, 1); continue; }
      ctx.fillStyle = 'rgba(45,42,40,' + (fsm.life * 0.125).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(fsm.x, fsm.y, fsm.r, 0, Math.PI * 2); ctx.fill();
    }

    // --- steam wisps rising from rooftop vents ---
    if (steamVents.length && Math.random() < 0.18){
      var svp = steamVents[(Math.random() * steamVents.length) | 0];
      steamPuffs.push({ x: svp.x + (Math.random() - 0.5) * 4, y: svp.y,
                        life: 1, r: 2.5 + Math.random() * 3 });
    }
    for (var spi = steamPuffs.length - 1; spi >= 0; spi--){
      var spf = steamPuffs[spi];
      spf.y -= 0.22; spf.x += (Math.random() - 0.5) * 0.3;
      spf.life -= 0.008; spf.r += 0.08;
      if (spf.life <= 0){ steamPuffs.splice(spi, 1); continue; }
      ctx.fillStyle = 'rgba(190,195,200,' + (spf.life * 0.22).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(spf.x, spf.y, spf.r, 0, Math.PI * 2); ctx.fill();
    }

    // --- infection bursts ---
    for (var b = bursts.length - 1; b >= 0; b--){
      var bu = bursts[b];
      ctx.save();
      ctx.globalAlpha = bu.life * 0.8;
      ctx.strokeStyle = ZOMBIE;
      ctx.lineWidth = 2.5 * bu.life + 0.5;
      ctx.shadowColor = ZOMBIE;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      bu.r += 2.2;
      bu.life -= 0.07;
      if (bu.life <= 0) bursts.splice(b, 1);
    }

    // --- dots (hidden until guess locked in) ---
    var hLeft = healthyCount();
    var done = started && hLeft === FINAL;
    // move the lone survivor to a central rooftop
    if (done && !winnerMoved){
      winnerMoved = true;
      var wdot = null;
      for (var wi = 0; wi < parts.length; wi++){
        if (!parts[wi].infected){ wdot = parts[wi]; break; }
      }
      if (wdot){
        var bestB = null, bestD = 1e18;
        for (var cbi = 0; cbi < buildings.length; cbi++){
          var cb2 = buildings[cbi];
          if (cb2.isCar || cb2.burning) continue;
          var bcx = cb2.x + cb2.w / 2, bcy = cb2.y + cb2.h / 2;
          var bd2 = (bcx - W/2) * (bcx - W/2) + (bcy - H/2) * (bcy - H/2);
          if (bd2 < bestD){ bestD = bd2; bestB = cb2; }
        }
        if (bestB){
          wdot.x = bestB.x + (bestB.rw || bestB.w * 0.7) / 2;
          wdot.y = bestB.y + (bestB.rh || bestB.h * 0.7) / 2;
          wdot.vx = 0; wdot.vy = 0;
        }
      }
    }
    if (started){
    var showNums = started && parts.length <= 40 && hLeft > FINAL;
    for (var m = 0; m < parts.length; m++){
      var q = parts[m];
      if (done && !q.infected){
        var pulse = 1 + 0.18 * Math.sin(simT * 4);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, (q.r + 6) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (q.infected){
        var gpulse = 0.75 + 0.25 * Math.sin(simT * 6 + q.num);
        var zcol = q.incubate > 0 ? '#b8d94a' : (q.runner && q.runnerT > 0 ? '#7dff5a' : ZOMBIE);
        ctx.save();
        ctx.globalAlpha = gpulse;
        ctx.shadowColor = zcol;
        ctx.shadowBlur = 8 + q.flash * 14;
        ctx.fillStyle = q.flash > 0.3 ? '#d6ffe0' : zcol;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = q.c;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // flashing circle on every survivor when fewer than 10 remain
      if (hLeft < 10 && !q.infected){
        ctx.save();
        ctx.globalAlpha = Math.sin(simT * 10 + q.num) > 0 ? 0.9 : 0.15;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // highlight the user's pick with a pulsing gold ring
      if (guess != null && q.num === guess && !q.infected){
        var hpulse = 1 + 0.18 * Math.sin(simT * 5);
        ctx.save();
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ffd24a';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(q.x, q.y, (q.r + 6) * hpulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (showNums){
        ctx.fillStyle = textColor;
        ctx.font = done ? '10px \'Special Elite\', monospace' : '8px \'Special Elite\', monospace';
        ctx.textAlign = 'center';
        ctx.fillText(q.num, q.x, q.y - q.r - 7);
      }
    }
    ctx.textAlign = 'left';
    }

    if (started && hLeft > FINAL && (++oddsTick % 20 === 0)) updateOdds();

    if (!started){
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = textColor;
      ctx.font = '13px \'Special Elite\', monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK IN YOUR GUESS TO RELEASE THE OUTBREAK', W / 2, H / 2);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    Sound.update();
    if ((++frameCount % 10) === 0) updateStats();
    ctx.restore();
    requestAnimationFrame(frame);
  }

  var muteBtn = document.getElementById('muteBtn');
  if (Sound.muted){ muteBtn.innerHTML = '&#128263;'; muteBtn.title = 'Unmute sound'; }
  muteBtn.addEventListener('click', function(){
    Sound.init(); Sound.resume();
    var m = Sound.toggleMute();
    muteBtn.innerHTML = m ? '&#128263;' : '&#128266;';
    muteBtn.title = m ? 'Unmute sound' : 'Mute sound';
  });
  guessBtn.addEventListener('click', function(){
    Sound.init(); Sound.resume();
    lockGuess();
  });
  var bloodSwitch = document.getElementById('bloodSwitch');
  var bloodKnob = document.getElementById('bloodKnob');
  function paintBloodSwitch(){
    bloodSwitch.style.background = bloodOn ? '#8b0000' : '#555';
    bloodKnob.style.left = bloodOn ? '14px' : '2px';
  }
  paintBloodSwitch();
  document.getElementById('bloodToggleWrap').addEventListener('click', function(){
    bloodOn = !bloodOn;
    try { localStorage.setItem('zombieBlood', bloodOn ? '1' : '0'); } catch(e){}
    if (!bloodOn && bloodCtx) bloodCtx.clearRect(0, 0, W, H);
    paintBloodSwitch();
  });
  var spdBtns = document.querySelectorAll('.spdBtn');
  for (var sbi = 0; sbi < spdBtns.length; sbi++){
    spdBtns[sbi].addEventListener('click', function(){
      simSpeed = parseInt(this.getAttribute('data-spd'), 10);
      for (var sbj = 0; sbj < spdBtns.length; sbj++){
        var active = spdBtns[sbj].getAttribute('data-spd') == String(simSpeed);
        spdBtns[sbj].style.background = active ? '#1d7a3a' : 'var(--hatch-widget-surface)';
        spdBtns[sbj].style.color = active ? '#fff' : 'var(--hatch-widget-text)';
        spdBtns[sbj].style.border = active ? 'none' : '1px solid var(--hatch-widget-border)';
      }
    });
  }
  guessInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') lockGuess(); });
  document.getElementById('reset10').addEventListener('click', function(){
    Sound.init(); Sound.resume(); Sound.radioClick();
    reset();
  });
  dotsInput.addEventListener('change', reset);
  var resizeTimer = null;
  window.addEventListener('resize', function(){
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      var oldW = W, oldH = H;
      resize();
      // scale everything — never regenerate the city on resize
      var sx = W / oldW, sy = H / oldH;
      for (var b = 0; b < buildings.length; b++){
        var bd = buildings[b];
        bd.x *= sx; bd.y *= sy; bd.w *= sx; bd.h *= sy;
      }
      rebuildBuildingGrid();
      for (var i = 0; i < parts.length; i++){
        var p = parts[i];
        p.x *= sx; p.y *= sy;
        p.x = Math.max(p.r, Math.min(W - p.r, p.x));
        p.y = Math.max(p.r, Math.min(H - p.r, p.y));
        collideBuildings(p);
      }
      rebuildGrid();
    }, 400);
  });

  resize();
  reset();
  requestAnimationFrame(frame);
})();
