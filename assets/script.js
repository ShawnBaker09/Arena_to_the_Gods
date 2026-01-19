// Arena to the Gods - canvas-based small shooter with upgrades + localStorage
const SAVE_KEY = 'atg_save_v1';

const WEAPON_TYPES = ["Sword","Axe","Gun","Staff","Bow","Dagger","Hammer","Spear"];
const RARITY = ["Common","Rare","Epic","Legendary"];

let canvas, ctx;
let tickInterval = null;

let game = {
  running: false,
  player: {
    name: '',
    class: '',
    hp: 30,
    maxHp: 30,
    x: 400, y: 240, size: 28,
    weapon: null,
    upgrades: { dmgMult: 1, range: 0, fireRate: 1 },
    upgradeLevels: { dmg: 0, range: 0, fire: 0 }
  },
  gold: 0,
  wave: 1,
  level: 1,
  enemies: [],
  bullets: [],
  showRange: true
};

let shopItems = null;

function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try { Object.assign(game, JSON.parse(raw)); return true; } catch (e) { console.warn('Failed load', e); return false; }
}

function init() {
  canvas = document.getElementById('arena');
  ctx = canvas.getContext('2d');
  document.getElementById('startBtn').addEventListener('click', startFromSetup);
  document.getElementById('shopBtn').addEventListener('click', openShop);
  document.getElementById('resumeBtn').addEventListener('click', resumeArena);
  document.getElementById('saveBtn').addEventListener('click', () => { saveGame(); flash('Saved'); });
  const rangeToggle = document.createElement('button');
  rangeToggle.textContent = 'Toggle Range';
  rangeToggle.classList.add('btnSmall');
  rangeToggle.addEventListener('click', () => { game.showRange = !game.showRange; updateUI(); });
  document.querySelector('nav').appendChild(rangeToggle);

  document.querySelectorAll('#classSelect button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#classSelect button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    });
  });

  if (loadGame()) {
    // ensure required player properties exist after loading from older saves
    game.player.x = game.player.x || (canvas ? canvas.width/2 : 400);
    game.player.y = game.player.y || (canvas ? canvas.height/2 : 240);
    game.player.size = game.player.size || 28;
    game.player.upgrades = game.player.upgrades || { dmgMult: 1, range: 0, fireRate: 1 };
    game.player.upgradeLevels = game.player.upgradeLevels || { dmg: 0, range: 0, fire: 0 };
    updateUI();
  }
  // draw initial state even before starting
  render();
}

function startFromSetup() {
  const name = document.getElementById('nameInput').value.trim() || 'Champion';
  const clsBtn = document.querySelector('#classSelect .sel');
  const cls = clsBtn ? clsBtn.getAttribute('data-class') : 'Warrior';
  game.player.name = name; game.player.class = cls; game.player.hp = game.player.maxHp = 50;
  game.player.x = canvas.width/2; game.player.y = canvas.height/2;
  // default weapon based on class
  const baseWeapon = makeBaseWeapon(cls);
  game.player.weapon = baseWeapon;
  // reset game state
  game.gold = 20; game.wave = 1; game.level = 1; game.enemies = []; game.bullets = []; game.running = true;
  // remove any existing shop overlay
  const prevShop = document.getElementById('__shopOverlay'); if (prevShop) prevShop.remove();
  // reset upgrades and upgrade levels (so prices start fresh)
  game.player.upgrades = { dmgMult: 1, range: 0, fireRate: 1 };
  game.player.upgradeLevels = { dmg: 0, range: 0, fire: 0 };
  startLoop(); updateUI(); saveGame();
}

function makeBaseWeapon(cls) {
  // return weapon object with properties: name,type,dmg,fireRate(bps),bulletSpeed,range
  if (cls === 'Warrior') return {type:'Sword', name:'Basic Sword', dmg:6, fireRate:1.0, bulletSpeed:220, range:90, upgrades:{dmg:0,fire:0,range:0}};
  if (cls === 'Ranger') return {type:'Gun', name:'Basic Gun', dmg:3, fireRate:2.0, bulletSpeed:420, range:220, upgrades:{dmg:0,fire:0,range:0}};
  return {type:'Staff', name:'Basic Staff', dmg:4, fireRate:1.4, bulletSpeed:300, range:160, upgrades:{dmg:0,fire:0,range:0}};
}

function startLoop() { if (tickInterval) clearInterval(tickInterval); tickInterval = setInterval(gameTick, 1000/30); }
function resumeArena() { game.running = true; startLoop(); }

function gameTick() {
  if (!game.running) return;
  spawnEnemies();
  updateEnemies(1/30);
  updateBullets(1/30);
  tryToFire(1/30);
  checkWaveEnd();
  render();
  updateUI();
  saveGame();
}

function spawnEnemies() {
  if (game.enemies.length === 0) {
    const count = 3 + game.wave * 2;
    for (let i=0;i<count;i++) {
      const side = Math.floor(Math.random()*4);
      let x=0,y=0;
      if (side===0){ x = Math.random()*canvas.width; y = -20; }
      if (side===1){ x = Math.random()*canvas.width; y = canvas.height+20; }
      if (side===2){ x = -20; y = Math.random()*canvas.height; }
      if (side===3){ x = canvas.width+20; y = Math.random()*canvas.height; }
      const hp = 5 + Math.floor(game.wave*1.5);
      const spd = 20 + game.wave*2 + Math.random()*20;
      game.enemies.push({x,y,r:12,hp,spd});
    }
  }
}

function updateEnemies(dt) {
  const px = game.player.x, py = game.player.y, pR = game.player.size/2;
  for (let i=game.enemies.length-1;i>=0;i--) {
    const e = game.enemies[i];
    const dx = px - e.x, dy = py - e.y; const dist = Math.hypot(dx,dy) || 1;
    e.x += (dx/dist) * e.spd * dt;
    e.y += (dy/dist) * e.spd * dt;
    // check reach player
    if (dist <= e.r + pR) {
      game.player.hp -= Math.max(1, Math.floor(game.wave/2));
      game.enemies.splice(i,1);
      if (game.player.hp <= 0) { game.running = false; clearInterval(tickInterval); }
    }
  }
}

function updateBullets(dt) {
  for (let i=game.bullets.length-1;i>=0;i--) {
    const b = game.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // remove out of bounds or expired
    if (b.life <= 0 || b.x< -50 || b.x>canvas.width+50 || b.y<-50 || b.y>canvas.height+50) { game.bullets.splice(i,1); continue; }
    // collision with enemies
    for (let j=game.enemies.length-1;j>=0;j--) {
      const e = game.enemies[j];
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d <= e.r) {
        e.hp -= b.dmg;
        if (e.hp <= 0) { game.enemies.splice(j,1); game.gold += 4 + Math.floor(game.wave*0.6); }
        game.bullets.splice(i,1);
        break;
      }
    }
  }
}

function tryToFire(dt) {
  const w = game.player.weapon; if (!w) return;
  w._cooldown = (w._cooldown || 0) - dt;
  const range = w.range + (game.player.upgrades.range || 0);
  // find nearest enemy in range
  let nearest = null; let nd = 1e9;
  for (const e of game.enemies) {
    const d = Math.hypot(e.x - game.player.x, e.y - game.player.y);
    if (d <= range && d < nd) { nd = d; nearest = e; }
  }
  if (nearest && w._cooldown <= 0) {
    // fire towards nearest
    const ang = Math.atan2(nearest.y - game.player.y, nearest.x - game.player.x);
    const speed = w.bulletSpeed || 300;
    const dmg = Math.max(1, Math.floor((w.dmg || 1) * (1 + (game.player.upgrades.dmgMult-1))));
    const vx = Math.cos(ang) * speed; const vy = Math.sin(ang) * speed;
    game.bullets.push({x:game.player.x, y:game.player.y, vx, vy, dmg, life:2});
    // cooldown uses fireRate (shots per second) and fire upgrades
    const effRate = w.fireRate * (game.player.upgrades.fireRate || 1);
    w._cooldown = 1 / Math.max(0.01, effRate);
  }
}

function checkWaveEnd() {
  if (game.enemies.length === 0) { game.wave++; game.level++; }
}

function generateWeapon(level) {
  const type = WEAPON_TYPES[Math.floor(Math.random()*WEAPON_TYPES.length)];
  const rarity = RARITY[Math.min(3, Math.floor(level/10))];
  // basic per-type balance
  const base = (type==='Sword') ? {dmg: Math.max(2,Math.floor(level*1.6)), fireRate:0.8, bulletSpeed:240, range:100}
             : (type==='Axe') ? {dmg: Math.max(3,Math.floor(level*1.8)), fireRate:0.7, bulletSpeed:200, range:90}
             : (type==='Gun') ? {dmg: Math.max(1,Math.floor(level*1.0)), fireRate:2.0, bulletSpeed:520, range:240}
             : (type==='Bow') ? {dmg: Math.max(1,Math.floor(level*1.1)), fireRate:1.8, bulletSpeed:460, range:260}
             : (type==='Dagger') ? {dmg: Math.max(2,Math.floor(level*1.3)), fireRate:2.4, bulletSpeed:340, range:120}
             : (type==='Hammer') ? {dmg: Math.max(4,Math.floor(level*1.9)), fireRate:0.6, bulletSpeed:180, range:80}
             : (type==='Spear') ? {dmg: Math.max(3,Math.floor(level*1.5)), fireRate:1.0, bulletSpeed:300, range:140}
             : {dmg: Math.max(2,Math.floor(level*1.2)), fireRate:1.2, bulletSpeed:320, range:160};
  const name = `${rarity} ${type}`;
  return {type, name, dmg: base.dmg, fireRate: base.fireRate, bulletSpeed: base.bulletSpeed, range: base.range, price: Math.max(10, Math.floor(level*20)) };
}

function openShop() {
  // ensure only one shop overlay exists
  const prev = document.getElementById('__shopOverlay'); if (prev) prev.remove();
  // generate multiple shop items
  shopItems = [generateWeapon(game.level), generateWeapon(game.level), generateWeapon(game.level)];
  // show shop overlay inside canvas area
  const arenaDiv = document.getElementById('arena');
  // simple DOM overlay: replace canvas with text temporarily
  // We'll draw UI below canvas instead: use prompt-like approach
  // build HTML for multiple items
  let html = '<div class="shop">';
  shopItems.forEach((it, idx) => {
    html += `\n      <div class="shopItem" style="margin-bottom:8px;">`;
    html += `<div><strong>${it.name}</strong></div>`;
    html += `<div>DMG +${it.dmg}  FR ${it.fireRate.toFixed(2)}  RNG ${it.range}</div>`;
    html += `<div>Price $${it.price}</div>`;
    html += `<div><button data-buy-index="${idx}" class="buyItem btnSmall">Buy</button></div>`;
    html += `</div>`;
  });
  html += `\n  <div><button id="leaveShop">Leave</button></div></div>`;
  // temporarily draw shop text over canvas using a small DOM node
  const shopNode = document.createElement('div');
  shopNode.id='__shopOverlay'; shopNode.className='shop';
  shopNode.style.position='absolute';
  // position relative to canvas on screen
  const r = canvas.getBoundingClientRect();
  shopNode.style.left = (window.scrollX + r.left + 16) + 'px';
  shopNode.style.top = (window.scrollY + r.top + 16) + 'px';
  shopNode.style.background = '#111'; shopNode.style.padding = '12px'; shopNode.style.border = '1px solid #333'; shopNode.style.borderRadius = '6px';
  shopNode.style.zIndex = 9999;
  shopNode.innerHTML = html;
  document.body.appendChild(shopNode);
  // attach handlers scoped to overlay
  const buyBtns = shopNode.querySelectorAll('.buyItem');
  buyBtns.forEach(b => {
    b.addEventListener('click', (ev) => {
      const idx = Number(b.getAttribute('data-buy-index'));
      buyWeapon(idx, shopNode);
    });
  });
  const leaveBtn = shopNode.querySelector('#leaveShop');
  if (leaveBtn) leaveBtn.addEventListener('click', () => { if (shopNode) shopNode.remove(); shopItems = null; });
}

function buyWeapon(index, shopNode) {
  if (!shopItems || shopItems.length <= index) return;
  const item = shopItems[index];
  if (game.gold >= item.price) {
    game.gold -= item.price;
    game.player.weapon = {type: item.type, name: item.name, dmg: item.dmg, fireRate: item.fireRate, bulletSpeed: item.bulletSpeed, range: item.range, upgrades:{dmg:0,fire:0,range:0}};
    if (shopNode) shopNode.remove();
    shopItems = null; flash('Weapon bought'); updateUI(); saveGame();
  } else {
    flash('Not enough gold');
  }
}

function buyUpgrade(target) {
  // target: 'dmg'|'range'|'fire'
  const cost = getUpgradeCost(target);
  if (game.gold < cost) { flash('Not enough gold'); return; }
  game.gold -= cost;
  // increment level and apply stat increases per level
  if (target === 'dmg') {
    game.player.upgradeLevels.dmg = (game.player.upgradeLevels.dmg || 0) + 1;
    // scale multiplier by 1.25 per level
    game.player.upgrades.dmgMult = +(1 * Math.pow(1.25, game.player.upgradeLevels.dmg)).toFixed(2);
  }
  if (target === 'range') {
    game.player.upgradeLevels.range = (game.player.upgradeLevels.range || 0) + 1;
    game.player.upgrades.range = (game.player.upgradeLevels.range || 0) * 20;
  }
  if (target === 'fire') {
    game.player.upgradeLevels.fire = (game.player.upgradeLevels.fire || 0) + 1;
    game.player.upgrades.fireRate = +(1 * Math.pow(1.15, game.player.upgradeLevels.fire)).toFixed(2);
  }
  flash('Upgrade applied'); updateUI(); saveGame();
}

function getUpgradeCost(target) {
  // base costs and exponential scaling by level
  if (target === 'dmg') {
    const base = 12; const lvl = game.player.upgradeLevels.dmg || 0;
    return Math.max(5, Math.floor(base * Math.pow(1.6, lvl)));
  }
  if (target === 'range') {
    const base = 10; const lvl = game.player.upgradeLevels.range || 0;
    return Math.max(5, Math.floor(base * Math.pow(1.5, lvl)));
  }
  // fire
  const base = 14; const lvl = game.player.upgradeLevels.fire || 0;
  return Math.max(6, Math.floor(base * Math.pow(1.5, lvl)));
}

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // background
  ctx.fillStyle = '#07070b'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // range circle
  const w = game.player.weapon; const range = (w ? w.range : 100) + (game.player.upgrades.range || 0);
  if (game.showRange) {
    ctx.beginPath(); ctx.fillStyle = 'rgba(200,200,200,0.06)'; ctx.arc(game.player.x, game.player.y, range, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,200,200,0.12)'; ctx.stroke();
  }
  // player square
  const s = game.player.size; ctx.fillStyle = '#4ea1ff'; ctx.fillRect(game.player.x - s/2, game.player.y - s/2, s, s);
  // enemies
  for (const e of game.enemies) {
    ctx.beginPath(); ctx.fillStyle = 'crimson'; ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
    // HP bar
    ctx.fillStyle = '#222'; ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r*2, 4);
    ctx.fillStyle = '#8f8'; ctx.fillRect(e.x - e.r, e.y - e.r - 8, (e.hp / (5 + Math.floor(game.wave*1.5)))*e.r*2, 4);
  }
  // bullets
  for (const b of game.bullets) { ctx.beginPath(); ctx.fillStyle = '#ffd27f'; ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); }
}

function updateUI() {
  const statArea = document.getElementById('statArea');
  const w = game.player.weapon;
  statArea.innerHTML = `
    <div><strong>${game.player.name}</strong> (${game.player.class})</div>
    <div>HP: ${Math.max(0, game.player.hp)}/${game.player.maxHp}</div>
    <div>Gold: ${game.gold}</div>
    <div>Wave: ${game.wave}</div>
    <div>Enemies: ${game.enemies.length}</div>
    <div class="hudSmall">Weapon: ${w ? w.name : 'None'}</div>
    <div class="hudSmall">DMG: ${w ? w.dmg : '-'}  FR: ${w ? w.fireRate : '-'}  RNG: ${w ? w.range : '-'}</div>
  `;
  const upgradesArea = document.getElementById('upgradesArea');
  const dmgCost = getUpgradeCost('dmg');
  const rangeCost = getUpgradeCost('range');
  const fireCost = getUpgradeCost('fire');
  upgradesArea.innerHTML = `
    <div>Damage x${game.player.upgrades.dmgMult} <span class="hudSmall">(next: $${dmgCost})</span></div>
    <div>Range bonus: +${game.player.upgrades.range || 0} <span class="hudSmall">(next: $${rangeCost})</span></div>
    <div>Fire rate mult: x${(game.player.upgrades.fireRate||1).toFixed(2)} <span class="hudSmall">(next: $${fireCost})</span></div>
    <div style="margin-top:6px;"><button id="upDmg" class="btnSmall">Buy +DMG ($${dmgCost})</button> <button id="upRange" class="btnSmall">Buy +Range ($${rangeCost})</button> <button id="upFire" class="btnSmall">Buy +Fire ($${fireCost})</button></div>
  `;
  document.getElementById('upDmg').addEventListener('click', ()=>buyUpgrade('dmg'));
  document.getElementById('upRange').addEventListener('click', ()=>buyUpgrade('range'));
  document.getElementById('upFire').addEventListener('click', ()=>buyUpgrade('fire'));
  // disable buttons when unaffordable
  document.getElementById('upDmg').disabled = (game.gold < dmgCost);
  document.getElementById('upRange').disabled = (game.gold < rangeCost);
  document.getElementById('upFire').disabled = (game.gold < fireCost);
}

function flash(msg) { const prev = document.getElementById('arena'); ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(10,10,220,30); ctx.fillStyle='#fff'; ctx.font='14px Arial'; ctx.fillText(msg, 18, 32); ctx.restore(); setTimeout(()=>render(),700); }

window.addEventListener('load', init);
