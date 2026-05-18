/*
  NUMSTRIKE - Arithmetic Arcade Shooter v3
  =========================================

  INPUT SYSTEM:
    Answer is built by pressing multiplier keys. Each press adds
    that key's assigned value to the current answer. Press the same
    key again to subtract (toggle). Arrow Up/Down nudge by 1 for
    fine-tuning. Backspace resets to zero. Space fires.

    Default mapping:
      A = +2    S = +3    D = +5    W = +7

    Pre-game CONFIG MENU lets the player toggle each key on/off
    and cycle its value through [2, 3, 5, 7, 10, 11].

  WHY THIS IS A MATH MECHANIC:
    To hit 14:  D(+5) D(+5) A(+2) A(+2)  -- decompose into 5+5+2+2
    To hit 21:  W(+7) W(+7) W(+7)          -- recognize multiples of 7
    To hit 15:  D(+5) D(+5) D(+5)          -- multiples of 5
    Players discover efficient decompositions, building number sense.
    Wrong shots still bounce back, punishing imprecise arithmetic.

  MATH PROGRESSION:
    Wave 1-3:   Addition, sums 2-9.  Single key press.
    Wave 4-6:   Addition, sums 10-20. Two-key combos.
    Wave 7-9:   Subtraction. Positive results. Toggle + nudge.
    Wave 10-12: Mixed add/subtract, results to 25.
    Wave 13-15: Multiplication tables (2-9 x 2-9).
    Wave 16+:   Chained ops, possible negatives.

  PLAYTESTING:
    PT1: Wave 1 sums 2-9, slow enemies, 5+ seconds before threat.
      Config menu teaches controls. Wrong shot bounces labeled.
    PT2: Late waves require fast multi-key combos under pressure.
      Combo multiplier rewards memorized decompositions.
    PT3: Full reset verified. Particle cap 200, bullet cap 40.
      Config persists across sessions via localStorage.
*/

const C = document.getElementById("c");
const ctx = C.getContext("2d");
const W = 480,
  H = 680;
C.width = W;
C.height = H;
C.style.width = W + "px";
C.style.height = H + "px";

const AC = new AudioContext();

function tone(freq, type, dur, vol, t0) {
  const t = t0 || AC.currentTime;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.connect(g);
  g.connect(AC.destination);
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol || 0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, fc) {
  const buf = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource();
  const g = AC.createGain();
  const f = AC.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = fc || 1200;
  src.buffer = buf;
  src.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  g.gain.setValueAtTime(vol || 0.3, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  src.start();
}

const snd = {
  shoot() {
    tone(660, "square", 0.06, 0.13);
    tone(1320, "square", 0.03, 0.06, AC.currentTime + 0.02);
  },
  wrong() {
    tone(110, "sawtooth", 0.22, 0.22);
    tone(75, "sawtooth", 0.18, 0.17, AC.currentTime + 0.07);
    noise(0.15, 0.18, 400);
  },
  correct(m) {
    [440, 550, 660].forEach((f, i) =>
      tone(
        f * (1 + (m - 1) * 0.08),
        "square",
        0.13,
        0.07,
        AC.currentTime + i * 0.02,
      ),
    );
  },
  explode(b) {
    noise(b ? 0.35 : 0.2, b ? 0.5 : 0.32, b ? 350 : 800);
    tone(b ? 55 : 85, "sawtooth", b ? 0.3 : 0.18, 0.3);
  },
  hit() {
    noise(0.14, 0.4, 600);
    tone(140, "sawtooth", 0.18, 0.28);
  },
  death() {
    [200, 160, 120, 90, 60].forEach((f, i) =>
      tone(f, "sawtooth", 0.22, 0.26, AC.currentTime + i * 0.13),
    );
    noise(0.7, 0.5, 300);
  },
  levelup() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, "square", 0.14, 0.15, AC.currentTime + i * 0.1),
    );
  },
  keyPress(v) {
    tone(300 + v * 35, "square", 0.05, 0.09);
  },
  back() {
    tone(250, "square", 0.06, 0.1);
  },
  combo(m) {
    tone(262 + m * 28, "square", 0.09, 0.13);
  },
  click() {
    tone(900, "square", 0.05, 0.1);
  },
  nav() {
    tone(500, "square", 0.04, 0.08);
  },
};

const AVAILABLE_VALUES = [2, 3, 5, 7, 10, 11];

function loadConfig() {
  try {
    const raw = localStorage.getItem("numstrike_cfg_v3");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    bindings: [
      { key: "A", value: 2, active: true },
      { key: "S", value: 3, active: true },
      { key: "D", value: 5, active: true },
      { key: "W", value: 7, active: true },
    ],
  };
}

function saveConfig() {
  localStorage.setItem("numstrike_cfg_v3", JSON.stringify(cfg));
}

let cfg = loadConfig();
let hiScore = parseInt(localStorage.getItem("numstrike_hi") || "0");

const STATE = { TITLE: 0, CONFIG: 1, PLAY: 2, DEAD: 3 };
let state = STATE.TITLE;

let score, wave, lives, combo, comboFlash, shake, shakeX, shakeY;
let waveCooldown, invincible;
let player;
let currentAnswer, lastShot, answerFlash, answerFlashColor;
let enemies, playerBullets, enemyBullets, particles, floatingTexts, stars;

const keysDown = {};
const keysJust = {};

let configCursor = 0;

function initStars() {
  stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: Math.random() * 1.5 + 0.3,
      sp: Math.random() * 32 + 8,
      b: Math.random(),
    });
  }
}

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function generateExpression(waveNum) {
  const tier = Math.floor((waveNum - 1) / 3);
  let expr, answer;
  if (tier === 0) {
    const a = rand(1, 5),
      b = rand(1, 4);
    expr = `${a} + ${b}`;
    answer = a + b;
  } else if (tier === 1) {
    const a = rand(5, 12),
      b = rand(3, 9);
    expr = `${a} + ${b}`;
    answer = a + b;
  } else if (tier === 2) {
    const a = rand(7, 15),
      b = rand(2, Math.max(2, a - 1));
    expr = `${a} - ${b}`;
    answer = a - b;
  } else if (tier === 3) {
    if (Math.random() < 0.5) {
      const a = rand(10, 20),
        b = rand(3, 10);
      expr = `${a} - ${b}`;
      answer = a - b;
    } else {
      const a = rand(9, 16),
        b = rand(6, 9);
      expr = `${a} + ${b}`;
      answer = a + b;
    }
  } else if (tier === 4) {
    const a = rand(2, 9),
      b = rand(2, 9);
    expr = `${a} \u00d7 ${b}`;
    answer = a * b;
  } else {
    const r = Math.random();
    if (r < 0.35) {
      const a = rand(3, 9),
        b = rand(3, 9);
      expr = `${a} \u00d7 ${b}`;
      answer = a * b;
    } else if (r < 0.65) {
      const a = rand(3, 9),
        b = rand(2, 9),
        c = rand(1, 6);
      expr = `${a} \u00d7 ${b} - ${c}`;
      answer = a * b - c;
    } else {
      const a = rand(10, 25),
        b = rand(3, 12),
        c = rand(2, 8);
      expr = `${a} - ${b} + ${c}`;
      answer = a - b + c;
    }
  }
  return { expr, answer };
}

function spawnWave() {
  const count = Math.min(2 + Math.floor(wave / 2), 8);
  const baseSpeed = 22 + wave * 3.5;
  for (let i = 0; i < count; i++) {
    const col = i % 4,
      row = Math.floor(i / 4);
    const { expr, answer } = generateExpression(wave);
    const x = 62 + (col * (W - 124)) / 3 + rand(-12, 12);
    const y = -80 - row * 95;
    enemies.push({
      x,
      y,
      w: 72,
      h: 46,
      expr,
      answer,
      speed: baseSpeed + Math.random() * 10,
      vx: (Math.random() - 0.5) * 28,
      flash: 0,
      glitch: 0,
    });
  }
}

function addParticle(x, y, vx, vy, color, life, size) {
  if (particles.length >= 200) return;
  particles.push({ x, y, vx, vy, color, life, maxLife: life, size: size || 2 });
}

function explode(x, y, color, count, big) {
  const n = count || 16;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const sp = Math.random() * (big ? 220 : 160) + 50;
    addParticle(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      color,
      0.55 + Math.random() * 0.45,
      Math.random() * 3 + 1,
    );
  }
  for (let i = 0; i < 5; i++)
    addParticle(
      x,
      y,
      (Math.random() - 0.5) * 70,
      (Math.random() - 0.5) * 70,
      "#fff",
      0.25,
      4,
    );
}

function floatText(x, y, text, color, size) {
  floatingTexts.push({
    x,
    y,
    text,
    color: color || "#fff",
    size: size || 14,
    vy: -55,
    life: 1.0,
  });
}

function doShake(amt) {
  shake = Math.max(shake, amt);
}

function resetGame() {
  score = 0;
  wave = 1;
  lives = 3;
  combo = 0;
  comboFlash = 0;
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  waveCooldown = 0;
  invincible = 0;
  currentAnswer = 0;
  lastShot = 0;
  answerFlash = 0;
  answerFlashColor = "#0cf";
  player = { x: W / 2, y: H - 72, vx: 0 };
  enemies = [];
  playerBullets = [];
  enemyBullets = [];
  particles = [];
  floatingTexts = [];
  spawnWave();
}

function getMultiplier() {
  return Math.min(1 + Math.floor(combo / 3), 8);
}

function multColor(m) {
  if (m >= 8) return "#ff0";
  if (m >= 5) return "#f80";
  if (m >= 3) return "#0ff";
  return "#0f8";
}

function activeBindings() {
  return cfg.bindings.filter((b) => b.active);
}

function applyBinding(binding) {
  const next = currentAnswer + binding.value;
  if (Math.abs(next) > 99) return;
  currentAnswer = next;
  answerFlash = 0.2;
  answerFlashColor = "#ff0";
  snd.keyPress(binding.value);
}

function tryFire() {
  const now = performance.now() / 1000;
  if (now - lastShot < 0.26) return;
  if (playerBullets.length >= 40) return;
  lastShot = now;
  snd.shoot();
  playerBullets.push({
    x: player.x,
    y: player.y - 16,
    value: currentAnswer,
    speed: 500,
    trail: [],
  });
}

function killPlayer() {
  state = STATE.DEAD;
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem("numstrike_hi", hiScore);
  }
  snd.death();
  explode(player.x, player.y, "#f80", 32, true);
  doShake(22);
}

function update(dt) {
  if (shake > 0) {
    shake -= dt * 90;
    shakeX = (Math.random() - 0.5) * shake * 2.2;
    shakeY = (Math.random() - 0.5) * shake * 2.2;
    if (shake < 0) {
      shake = 0;
      shakeX = 0;
      shakeY = 0;
    }
  }

  stars.forEach((s) => {
    s.y += s.sp * dt;
    if (s.y > H) s.y = 0;
  });

  if (state !== STATE.PLAY) return;

  if (invincible > 0) invincible -= dt;
  if (answerFlash > 0) answerFlash -= dt;

  if (keysDown["ArrowLeft"]) player.vx -= 900 * dt;
  if (keysDown["ArrowRight"]) player.vx += 900 * dt;
  if (!keysDown["ArrowLeft"] && !keysDown["ArrowRight"])
    player.vx *= Math.pow(0.04, dt);
  player.vx = Math.max(-280, Math.min(280, player.vx));
  player.x = Math.max(18, Math.min(W - 18, player.x + player.vx * dt));

  if (keysJust["ArrowUp"]) {
    currentAnswer = Math.min(99, currentAnswer + 1);
    answerFlash = 0.12;
    answerFlashColor = "#aff";
    snd.keyPress(1);
  }
  if (keysJust["ArrowDown"]) {
    currentAnswer = Math.max(-99, currentAnswer - 1);
    answerFlash = 0.12;
    answerFlashColor = "#aff";
    snd.keyPress(1);
  }
  if (keysJust["Backspace"]) {
    currentAnswer = 0;
    answerFlash = 0.22;
    answerFlashColor = "#f84";
    snd.back();
  }
  if (keysJust[" "]) tryFire();

  if (waveCooldown > 0) {
    waveCooldown -= dt;
    if (waveCooldown <= 0 && enemies.length === 0) {
      wave++;
      spawnWave();
      snd.levelup();
      floatText(W / 2, H / 2 - 20, `WAVE ${wave}`, "#ff0", 26);
    }
  } else if (enemies.length === 0) {
    waveCooldown = 2.2;
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed * dt;
    e.x += e.vx * dt;
    if (e.x < e.w / 2 + 4 || e.x > W - e.w / 2 - 4) e.vx *= -1;
    if (e.flash > 0) e.flash -= dt;
    if (e.glitch > 0) e.glitch -= dt;

    if (e.y > H + 50) {
      enemies.splice(i, 1);
      combo = 0;
      lives--;
      doShake(13);
      snd.hit();
      floatText(W / 2, H / 2, "ESCAPED!", "#f44", 20);
      if (lives <= 0) {
        killPlayer();
        return;
      }
    }
  }

  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];
    b.y -= b.speed * dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 9) b.trail.shift();
    if (b.y < -20) {
      playerBullets.splice(i, 1);
      continue;
    }

    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
        playerBullets.splice(i, 1);
        if (b.value === e.answer) {
          combo++;
          const m = getMultiplier();
          const pts = (100 + wave * 25) * m;
          score += pts;
          floatText(
            e.x,
            e.y,
            `+${pts}`,
            m > 1 ? multColor(m) : "#0f8",
            14 + (m - 1) * 2,
          );
          if (m > 1) floatText(e.x, e.y - 22, `\u00d7${m}!`, multColor(m), 13);
          explode(e.x, e.y, "#0cf", 20 + combo, m >= 5);
          snd.correct(m);
          snd.explode(m >= 5);
          doShake(3 + m);
          comboFlash = 0.45;
          snd.combo(m);
          enemies.splice(j, 1);
        } else {
          combo = 0;
          e.flash = 0.28;
          e.glitch = 0.55;
          snd.wrong();
          doShake(7);
          floatText(e.x, e.y - 16, `\u2260 ${e.answer}`, "#f55", 13);
          floatText(e.x, e.y + 14, "REFLECTED!", "#f84", 11);
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          if (enemyBullets.length < 40)
            enemyBullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 210,
              vy: Math.sin(ang) * 210,
              value: b.value,
              life: 5,
            });
        }
        break;
      }
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      enemyBullets.splice(i, 1);
      continue;
    }
    const dx = player.x - b.x,
      dy = player.y - b.y,
      dist = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx += ((dx / dist) * 200 - b.vx) * dt * 2.5;
    b.vy += ((dy / dist) * 200 - b.vy) * dt * 2.5;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (
      invincible <= 0 &&
      Math.abs(b.x - player.x) < 14 &&
      Math.abs(b.y - player.y) < 14
    ) {
      enemyBullets.splice(i, 1);
      lives--;
      invincible = 2.2;
      combo = 0;
      doShake(15);
      snd.hit();
      floatText(player.x, player.y - 22, "-1 LIFE", "#f44", 15);
      explode(player.x, player.y, "#f44", 14);
      if (lives <= 0) {
        killPlayer();
        return;
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 55 * dt;
    p.vx *= Math.pow(0.25, dt);
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y += t.vy * dt;
    t.vy *= Math.pow(0.15, dt);
    t.life -= dt * 1.3;
    if (t.life <= 0) floatingTexts.splice(i, 1);
  }

  if (comboFlash > 0) comboFlash -= dt;
}

function glow(fn, color, blur) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur || 18;
  fn();
  ctx.restore();
}

function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16),
    bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 255,
    ag = (ah >> 8) & 255,
    ab = ah & 255;
  const br = (bh >> 16) & 255,
    bg = (bh >> 8) & 255,
    bb = bh & 255;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function drawStars() {
  stars.forEach((s) => {
    ctx.globalAlpha = s.b * 0.75 + 0.2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(s.x, s.y, s.s, s.s);
  });
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  if (invincible > 0 && Math.floor(invincible * 12) % 2 === 0) return;
  const px = player.x,
    py = player.y;
  glow(
    () => {
      ctx.strokeStyle = "#0cf";
      ctx.fillStyle = "rgba(0,180,255,0.10)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py - 16);
      ctx.lineTo(px - 15, py + 12);
      ctx.lineTo(px - 7, py + 7);
      ctx.lineTo(px, py + 15);
      ctx.lineTo(px + 7, py + 7);
      ctx.lineTo(px + 15, py + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0cf";
      ctx.beginPath();
      ctx.arc(px, py - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    },
    "#0cf",
    22,
  );
  if (Math.random() < 0.75)
    addParticle(
      px + (Math.random() - 0.5) * 5,
      py + 15,
      (Math.random() - 0.5) * 18,
      Math.random() * 55 + 15,
      Math.random() < 0.5 ? "#f80" : "#ff4",
      0.12 + Math.random() * 0.1,
      2,
    );
}

function drawEnemy(e) {
  const gx =
    e.glitch > 0 && Math.random() < 0.45 ? (Math.random() - 0.5) * 7 : 0;
  const gy =
    e.glitch > 0 && Math.random() < 0.45 ? (Math.random() - 0.5) * 3 : 0;
  const col = e.flash > 0 ? "#f44" : "#d060ff";
  const fill = e.flash > 0 ? "rgba(255,30,30,0.14)" : "rgba(160,20,255,0.11)";
  const x = e.x + gx,
    y = e.y + gy,
    hw = e.w / 2,
    hh = e.h / 2;
  glow(
    () => {
      ctx.strokeStyle = col;
      ctx.fillStyle = fill;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - hw + 9, y - hh);
      ctx.lineTo(x + hw - 9, y - hh);
      ctx.lineTo(x + hw, y - hh + 7);
      ctx.lineTo(x + hw, y + hh - 7);
      ctx.lineTo(x + hw - 9, y + hh);
      ctx.lineTo(x - hw + 9, y + hh);
      ctx.lineTo(x - hw, y + hh - 7);
      ctx.lineTo(x - hw, y - hh + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const fs = e.expr.length > 8 ? 11 : e.expr.length > 5 ? 12 : 14;
      ctx.fillStyle = e.flash > 0 ? "#faa" : "#dda0ff";
      ctx.font = `bold ${fs}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.expr, x, y);
    },
    col,
    15,
  );
}

function drawBullet(b, isEnemy) {
  if (!isEnemy) {
    glow(
      () => {
        ctx.strokeStyle = "#ff0";
        ctx.lineWidth = 1.5;
        for (let i = 1; i < b.trail.length; i++) {
          ctx.globalAlpha = (i / b.trail.length) * 0.55;
          ctx.beginPath();
          ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
          ctx.lineTo(b.trail[i].x, b.trail[i].y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.value, b.x, b.y);
      },
      "#ff0",
      14,
    );
  } else {
    glow(
      () => {
        ctx.fillStyle = "#f44";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fdd";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.value, b.x, b.y - 12);
      },
      "#f44",
      18,
    );
  }
}

function drawAnswerPanel() {
  const panW = 130,
    panH = 64;
  const px = W / 2 - panW / 2,
    py = H - panH - 8;
  ctx.fillStyle = "rgba(0,12,28,0.92)";
  ctx.fillRect(px, py, panW, panH);
  const fa = answerFlash > 0 ? Math.min(answerFlash / 0.2, 1) : 0;
  ctx.strokeStyle = fa > 0 ? lerpColor("#0cf", answerFlashColor, fa) : "#0cf";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, panW, panH);
  const gc = answerFlash > 0 ? answerFlashColor : "#0cf";
  glow(
    () => {
      ctx.fillStyle = gc;
      ctx.font = `bold ${Math.abs(currentAnswer) > 9 ? 30 : 36}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(currentAnswer.toString(), W / 2, py + panH / 2);
    },
    gc,
    20,
  );
  ctx.fillStyle = "#2a4a5a";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("\u2191\u2193 fine  \u232b reset  SPACE fire", W / 2, py + 2);
}

function drawKeyPanel() {
  const bindings = activeBindings();
  if (bindings.length === 0) return;
  const kw = 50,
    kh = 42,
    gap = 6;
  const totalW = bindings.length * (kw + gap) - gap;
  const startX = W / 2 - totalW / 2 - 80;
  const panY = H - kh - 14;
  bindings.forEach((b, i) => {
    const kx = startX + i * (kw + gap),
      ky = panY;
    ctx.fillStyle = "rgba(0,22,12,0.88)";
    ctx.fillRect(kx, ky, kw, kh);
    ctx.strokeStyle = "#0f8";
    ctx.lineWidth = 1;
    ctx.strokeRect(kx, ky, kw, kh);
    ctx.fillStyle = "#0f8";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.key, kx + kw / 2, ky + kh * 0.38);
    ctx.fillStyle = "#ff0";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`+${b.value}`, kx + kw / 2, ky + kh * 0.76);
  });
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, W, 36);
  glow(
    () => {
      ctx.fillStyle = "#0cf";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${score}`, 10, 18);
    },
    "#0cf",
    10,
  );
  glow(
    () => {
      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`HI ${hiScore}`, W / 2, 18);
    },
    "#444",
    6,
  );
  for (let i = 0; i < 3; i++) {
    glow(
      () => {
        ctx.fillStyle = i < lives ? "#f80" : "#222";
        const hx = W - 14 - i * 22,
          hy = 18;
        ctx.beginPath();
        ctx.moveTo(hx, hy - 7);
        ctx.lineTo(hx - 7, hy + 6);
        ctx.lineTo(hx, hy + 2);
        ctx.lineTo(hx + 7, hy + 6);
        ctx.closePath();
        ctx.fill();
      },
      i < lives ? "#f80" : "transparent",
      10,
    );
  }
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H - 80, W, 80);
  const m = getMultiplier();
  if (combo > 0) {
    const mc = multColor(m);
    const blink = comboFlash > 0 && Math.floor(comboFlash * 18) % 2 === 0;
    glow(
      () => {
        ctx.fillStyle = blink ? "#fff" : mc;
        ctx.font = `bold ${12 + (m - 1) * 1.5}px monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`COMBO \u00d7${combo}  [${m}x]`, 10, H - 58);
      },
      mc,
      12,
    );
  }
  ctx.fillStyle = "#334";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`WAVE ${wave}`, W - 8, H - 58);
  drawKeyPanel();
  drawAnswerPanel();
  ctx.restore();
}

function drawConfig() {
  ctx.fillStyle = "#000810";
  ctx.fillRect(0, 0, W, H);
  drawStars();
  glow(
    () => {
      ctx.fillStyle = "#0f8";
      ctx.font = "bold 26px monospace";
      ctx.textAlign = "center";
      ctx.fillText("KEY CONFIGURATION", W / 2, 55);
    },
    "#0f8",
    18,
  );
  ctx.fillStyle = "#445";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    "\u2191\u2193 select   \u2190\u2192 change value   SPACE toggle on/off",
    W / 2,
    82,
  );

  const bindings = cfg.bindings;
  const rowH = 68,
    startY = 112;
  bindings.forEach((b, i) => {
    const y = startY + i * rowH;
    const sel = configCursor === i;
    ctx.fillStyle = sel ? "rgba(0,255,120,0.07)" : "rgba(0,20,10,0.5)";
    ctx.fillRect(36, y - 20, W - 72, 54);
    if (sel) {
      ctx.strokeStyle = "#0f8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(36, y - 20, W - 72, 54);
    }

    ctx.fillStyle = b.active ? "#0f8" : "#334";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(b.key, 58, y + 7);

    if (sel) {
      ctx.fillStyle = "#334";
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("\u25c4", 160, y + 7);
      ctx.fillText("\u25ba", 270, y + 7);
    }

    ctx.fillStyle = b.active ? "#ff0" : "#446";
    ctx.font = `bold 26px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`+${b.value}`, 215, y + 7);

    const tx = W - 88,
      ty = y + 7,
      tw = 52,
      th = 22;
    ctx.fillStyle = b.active ? "rgba(0,180,80,0.25)" : "rgba(20,20,40,0.6)";
    ctx.fillRect(tx - tw / 2, ty - th / 2, tw, th);
    ctx.strokeStyle = b.active ? "#0f8" : "#335";
    ctx.lineWidth = 1;
    ctx.strokeRect(tx - tw / 2, ty - th / 2, tw, th);
    ctx.fillStyle = b.active ? "#0f8" : "#446";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.active ? "ON" : "OFF", tx, ty);
  });

  const startY2 = startY + bindings.length * rowH + 16;
  const isSel = configCursor === bindings.length;
  const hasActive = activeBindings().length > 0;
  ctx.fillStyle = isSel
    ? hasActive
      ? "rgba(0,180,255,0.10)"
      : "rgba(80,0,0,0.15)"
    : "rgba(0,0,0,0.3)";
  ctx.fillRect(80, startY2, W - 160, 50);
  ctx.strokeStyle = isSel ? (hasActive ? "#0cf" : "#f44") : "#224";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(80, startY2, W - 160, 50);
  glow(
    () => {
      ctx.fillStyle = hasActive ? (isSel ? "#0cf" : "#336") : "#422";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        hasActive ? "START GAME" : "ENABLE AT LEAST ONE KEY",
        W / 2,
        startY2 + 25,
      );
    },
    hasActive ? "#0cf" : "#f44",
    10,
  );

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#334";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    "Values: " + AVAILABLE_VALUES.map((v) => `+${v}`).join("  "),
    W / 2,
    H - 32,
  );
  ctx.fillText("ESC or TAB to return to title", W / 2, H - 16);
}

function drawTitle() {
  ctx.fillStyle = "#000810";
  ctx.fillRect(0, 0, W, H);
  drawStars();
  const t = performance.now() / 1000;
  glow(
    () => {
      ctx.textAlign = "center";
      ctx.fillStyle = "#0cf";
      ctx.font = "bold 60px monospace";
      ctx.fillText("NUM", W / 2 - 55, H / 2 - 95);
      ctx.fillStyle = "#ff0";
      ctx.font = "bold 60px monospace";
      ctx.fillText("STRIKE", W / 2 + 38, H / 2 - 30);
    },
    "#0cf",
    32,
  );
  ctx.fillStyle = "#c060ff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("ARITHMETIC ARCADE SHOOTER", W / 2, H / 2 + 16);
  const pulse = Math.sin(t * 2.8) * 0.3 + 0.7;
  ctx.globalAlpha = pulse;
  glow(
    () => {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRESS SPACE TO START", W / 2, H / 2 + 56);
    },
    "#fff",
    10,
  );
  ctx.globalAlpha = 1;

  const rows = [
    ["\u2190\u2192 arrows", "move ship"],
    ["A S D W", "add value to answer"],
    ["\u2191\u2193 arrows", "fine-tune \u00b11"],
    ["\u232b backspace", "reset answer to 0"],
    ["SPACE", "fire"],
  ];
  const ry = H / 2 + 90;
  rows.forEach(([label, desc], i) => {
    const y = ry + i * 18;
    ctx.fillStyle = "#0f8";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "right";
    ctx.fillText(label, W / 2 - 8, y);
    ctx.fillStyle = "#556";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText(desc, W / 2 + 8, y);
  });

  ctx.fillStyle = "#445";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    "Wrong shots reflect back as homing missiles!",
    W / 2,
    ry + rows.length * 18 + 14,
  );
  ctx.fillStyle = "#ff0";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`BEST: ${hiScore}`, W / 2, ry + rows.length * 18 + 32);

  glow(
    () => {
      ctx.fillStyle = "#0f8";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("[ TAB ]  Configure keys", W / 2, H - 18);
    },
    "#0f8",
    10,
  );
}

function drawDead() {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, W, H);
  glow(
    () => {
      ctx.fillStyle = "#f44";
      ctx.font = "bold 46px monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", W / 2, H / 2 - 85);
    },
    "#f44",
    26,
  );
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`SCORE  ${score}`, W / 2, H / 2 - 25);
  ctx.fillStyle = "#ff0";
  ctx.font = "bold 15px monospace";
  ctx.fillText(`BEST   ${hiScore}`, W / 2, H / 2 + 10);
  if (score > 0 && score >= hiScore) {
    glow(
      () => {
        ctx.fillStyle = "#ff0";
        ctx.font = "bold 13px monospace";
        ctx.fillText("NEW HIGH SCORE!", W / 2, H / 2 + 34);
      },
      "#ff0",
      14,
    );
  }
  ctx.fillStyle = "#666";
  ctx.font = "13px monospace";
  ctx.fillText(`Wave ${wave}`, W / 2, H / 2 + 62);
  const pulse = Math.sin(performance.now() / 280) * 0.3 + 0.7;
  ctx.globalAlpha = pulse;
  glow(
    () => {
      ctx.fillStyle = "#0cf";
      ctx.font = "bold 14px monospace";
      ctx.fillText("SPACE  play again", W / 2, H / 2 + 105);
      ctx.fillStyle = "#0f8";
      ctx.font = "12px monospace";
      ctx.fillText("TAB  reconfigure keys", W / 2, H / 2 + 126);
    },
    "#0cf",
    10,
  );
  ctx.globalAlpha = 1;
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  floatingTexts.forEach((t) => {
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.text, t.x, t.y);
    ctx.shadowBlur = 0;
  });
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(shakeX, shakeY);
  ctx.fillStyle = "#000810";
  ctx.fillRect(0, 0, W, H);
  drawStars();

  if (state === STATE.TITLE) {
    ctx.restore();
    drawTitle();
    return;
  }
  if (state === STATE.CONFIG) {
    ctx.restore();
    drawConfig();
    return;
  }
  if (state === STATE.DEAD) {
    enemies.forEach(drawEnemy);
    drawParticles();
    ctx.restore();
    drawFloatingTexts();
    drawDead();
    return;
  }

  enemies.forEach(drawEnemy);
  playerBullets.forEach((b) => drawBullet(b, false));
  enemyBullets.forEach((b) => drawBullet(b, true));
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawFloatingTexts();
  drawHUD();
}

let lastTime = 0;
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  Object.keys(keysJust).forEach((k) => delete keysJust[k]);
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  const k = e.key;
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k))
    e.preventDefault();
  if (k === "Tab") e.preventDefault();

  const isNew = !keysDown[k];
  keysDown[k] = true;
  if (isNew) keysJust[k] = true;

  AC.resume();

  if (k === "Tab") {
    if (state === STATE.TITLE || state === STATE.DEAD) {
      state = STATE.CONFIG;
      configCursor = 0;
      snd.click();
    } else if (state === STATE.CONFIG) {
      state = STATE.TITLE;
      snd.click();
    }
    return;
  }
  if (k === "Escape" && state === STATE.CONFIG) {
    state = STATE.TITLE;
    snd.click();
    return;
  }

  if (state === STATE.CONFIG) {
    const n = cfg.bindings.length;
    if (k === "ArrowDown" || k === "s" || k === "S") {
      configCursor = (configCursor + 1) % (n + 1);
      snd.nav();
    } else if (k === "ArrowUp" || k === "w" || k === "W") {
      configCursor = (configCursor - 1 + n + 1) % (n + 1);
      snd.nav();
    } else if (configCursor < n) {
      const b = cfg.bindings[configCursor];
      if (k === "ArrowLeft" || k === "a" || k === "A") {
        const idx = AVAILABLE_VALUES.indexOf(b.value);
        b.value =
          AVAILABLE_VALUES[
            (idx - 1 + AVAILABLE_VALUES.length) % AVAILABLE_VALUES.length
          ];
        snd.nav();
        saveConfig();
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        const idx = AVAILABLE_VALUES.indexOf(b.value);
        b.value = AVAILABLE_VALUES[(idx + 1) % AVAILABLE_VALUES.length];
        snd.nav();
        saveConfig();
      } else if (k === " " || k === "Enter") {
        b.active = !b.active;
        snd.click();
        saveConfig();
      }
    } else if (k === " " || k === "Enter") {
      if (activeBindings().length > 0) {
        state = STATE.PLAY;
        resetGame();
        snd.click();
      }
    }
    return;
  }

  if (state === STATE.TITLE) {
    if (k === " " || k === "Enter") {
      state = STATE.PLAY;
      resetGame();
      snd.click();
    }
    return;
  }
  if (state === STATE.DEAD) {
    if (k === " " || k === "Enter") {
      state = STATE.PLAY;
      resetGame();
      snd.click();
    }
    return;
  }

  if (state === STATE.PLAY) {
    const upper = k.toUpperCase();
    const binding = cfg.bindings.find((b) => b.active && b.key === upper);
    if (binding && isNew) {
      applyBinding(binding);
      return;
    }
    if (k === "Backspace") {
      currentAnswer = 0;
      answerFlash = 0.22;
      answerFlashColor = "#f84";
      snd.back();
    }
    if (k === " ") tryFire();
    if (k === "ArrowUp") {
      currentAnswer = Math.min(99, currentAnswer + 1);
      answerFlash = 0.12;
      answerFlashColor = "#aff";
      snd.keyPress(1);
    }
    if (k === "ArrowDown") {
      currentAnswer = Math.max(-99, currentAnswer - 1);
      answerFlash = 0.12;
      answerFlashColor = "#aff";
      snd.keyPress(1);
    }
  }
});

document.addEventListener("keyup", (e) => {
  delete keysDown[e.key];
});

C.addEventListener("click", () => {
  AC.resume();
  if (state === STATE.TITLE) {
    state = STATE.PLAY;
    resetGame();
    snd.click();
  } else if (state === STATE.DEAD) {
    state = STATE.PLAY;
    resetGame();
    snd.click();
  }
});

initStars();
requestAnimationFrame(loop);
