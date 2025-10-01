// ========= Core Utilities =========
// Helper functions for common tasks
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const store = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k, d = null) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v === undefined || v === null ? d : v;
  } catch {
    return d;
  }
};

// ========= App State & UI Management =========
let SOUND_ENABLED = load('sound', true);
let GLOBAL_PAUSED = false;
let resumeHook = null;
let currentGameCleanup = null;
let currentGameInit = null;

// --- Sound functions ---
function _beep(type = 'click') {
  try {
    const ctx = _beep.ctx || (_beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    let f = 440,
      t = 0.08;
    if (type === 'win') {
      f = 880;
      t = 0.15;
    }
    if (type === 'lose') {
      f = 220;
      t = 0.25;
    }
    o.frequency.value = f;
    g.gain.value = 0.02;
    o.start();
    setTimeout(() => {
      o.stop();
    }, t * 1000);
  } catch (e) { /* audio may be blocked */ }
}

function beep(type = 'click') {
  if (SOUND_ENABLED) _beep(type);
}

// --- Theme toggle ---
const themeBtn = $('#themeBtn');

function setTheme(mode) {
  document.body.classList.toggle('dark', mode === 'dark');
  themeBtn.textContent = mode === 'dark' ? '☀️' : '🌙';
  store('theme', mode);
}
setTheme(load('theme', 'light'));
themeBtn.onclick = () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');

// --- Sound button toggle ---
const soundBtn = $('#soundBtn');

function setSound(on) {
  SOUND_ENABLED = !!on;
  soundBtn.textContent = SOUND_ENABLED ? '🔊' : '🔈';
  store('sound', SOUND_ENABLED);
}
setSound(SOUND_ENABLED);
soundBtn.onclick = () => setSound(!SOUND_ENABLED);

// --- Pause button ---
const pauseBtn = $('#pauseBtn');
pauseBtn.onclick = () => {
  GLOBAL_PAUSED = !GLOBAL_PAUSED;
  pauseBtn.textContent = GLOBAL_PAUSED ? '▶️' : '⏸';
  if (resumeHook && !GLOBAL_PAUSED) {
    resumeHook();
  }
};

// --- Screen/UI routing ---
const home = $('#home');
const gameView = $('#gameView');
const gameRoot = $('#gameRoot');
const gameTitle = $('#gameTitle');
const gameMeta = $('#gameMeta');
const restartBtn = $('#restartBtn');

function showHome() {
  gameView.classList.remove('active');
  home.classList.add('active');
  cleanupCurrentGame();
  toggleDpad(false);
}

function showGame() {
  home.classList.remove('active');
  gameView.classList.add('active');
}

// --- High score management ---
function getHS(id) {
  const v = load('hs_' + id, null);
  return v === null ? null : v;
}

function setHS(id, value) {
  if (value === null || value === undefined) return;
  store('hs_' + id, value);
}

function hsDisplay(v) {
  return v === null ? '-' : v;
}

// --- Swipe detection ---
function addSwipe(el, cb) {
  let sx = 0,
    sy = 0,
    t = 0;
  el.addEventListener('touchstart', e => {
    const p = e.changedTouches[0];
    sx = p.clientX;
    sy = p.clientY;
    t = performance.now();
  }, {
    passive: true
  });
  el.addEventListener('touchend', e => {
    const p = e.changedTouches[0];
    const dx = p.clientX - sx;
    const dy = p.clientY - sy;
    const dt = performance.now() - t;
    const adx = Math.abs(dx),
      ady = Math.abs(dy);
    if (dt < 500 && Math.max(adx, ady) > 25) {
      if (adx > ady) {
        cb(dx > 0 ? 'right' : 'left');
      } else {
        cb(dy > 0 ? 'down' : 'up');
      }
    }
  }, {
    passive: true
  });
}

// --- D-pad controls ---
const dpad = $('#dpad');
let dpadHandler = null;

function toggleDpad(show) {
  dpad.style.display = show ? '' : 'none';
}
dpad.addEventListener('pointerdown', e => {
  const dir = e.target.dataset.dir;
  if (dir && dpadHandler) dpadHandler(dir);
});

// ========= Game Catalog & Grid Rendering =========
const GAMES = [{
  id: 'clicker',
  name: 'Click The Button',
  cat: 'quick',
  desc: 'Tap to score. Simple & addictive.',
  init: initClicker
}, {
  id: 'rps',
  name: 'Rock Paper Scissors',
  cat: 'quick',
  desc: 'Classic luck & strategy.',
  init: initRPS
}, {
  id: 'tictactoe',
  name: 'Tic Tac Toe',
  cat: 'puzzle',
  desc: 'Play vs simple computer.',
  init: initTicTacToe
}, {
  id: 'snake',
  name: 'Snake',
  cat: 'arcade',
  desc: 'Eat food, avoid walls. (Swipe/D-pad)',
  init: initSnake
}, {
  id: 'guess',
  name: 'Number Guess',
  cat: 'puzzle',
  desc: '1–100 guessing game.',
  init: initGuess
}, {
  id: 'memory',
  name: 'Memory Match',
  cat: 'puzzle',
  desc: 'Match all pairs.',
  init: initMemory
}, {
  id: 'reaction',
  name: 'Reaction Timer',
  cat: 'quick',
  desc: 'How fast can you tap?',
  init: initReaction
}, {
  id: 'math',
  name: 'Math Quiz',
  cat: 'puzzle',
  desc: 'Quick mental math.',
  init: initMath
}, {
  id: 'flappy',
  name: 'Flappy',
  cat: 'arcade',
  desc: 'Dodge the pipes! (Tap/Space)',
  init: initFlappy
}, {
  id: '2048',
  name: '2048',
  cat: 'puzzle',
  desc: 'Merge tiles to 2048. (Swipe/Arrows)',
  init: init2048
}, {
  id: 'pong',
  name: 'Pong',
  cat: 'arcade',
  desc: 'Touch/drag to move your paddle.',
  init: initPong
}, {
  id: 'whack',
  name: 'Whack-a-Mole',
  cat: 'quick',
  desc: 'Tap the moles, beat the timer!',
  init: initWhack
}, {
  id: 'sudoku',
  name: 'Sudoku Mini (4x4)',
  cat: 'puzzle',
  desc: 'Small 4x4 Sudoku — fill the grid.',
  init: initSudoku
}, {
  id: 'sliding',
  name: 'Sliding Puzzle (3x3)',
  cat: 'puzzle',
  desc: 'Arrange tiles to order.',
  init: initSliding
}];

const grid = $('#gameGrid');
const yearEl = $('#year');
yearEl.textContent = new Date().getFullYear();

function renderGrid() {
  const q = ($('#search').value || '').toLowerCase();
  const activeCat = $('.chip.active').dataset.cat;
  grid.innerHTML = '';
  GAMES.filter(g => (activeCat === 'all' || g.cat === activeCat) && (g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)))
    .forEach(g => {
      const best = hsDisplay(getHS(g.id));
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${g.name}</h3>
      <div class="tag">${g.cat.toUpperCase()}</div>
      <p class="muted">${g.desc}</p>
      <div class="meta">
        <span>Best: <strong>${best}</strong></span>
        <button class="btn" data-id="${g.id}" aria-label="Play ${g.name}">Play</button>
      </div>`;
      card.querySelector('button').onclick = () => openGame(g.id);
      grid.appendChild(card);
    });
}

// Event listeners for filters and search
$$('#catChips .chip').forEach(c => c.onclick = () => {
  $$('#catChips .chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  renderGrid();
});
$('#search').addEventListener('input', renderGrid);
renderGrid();

// --- Game initialization and cleanup ---
function cleanupCurrentGame() {
  if (currentGameCleanup) {
    try {
      currentGameCleanup();
    } catch (e) { }
  }
  currentGameCleanup = null;
  resumeHook = null;
  gameRoot.innerHTML = '';
}

function openGame(id) {
  const g = GAMES.find(x => x.id === id);
  if (!g) return;
  cleanupCurrentGame();
  gameTitle.textContent = g.name;
  const best = hsDisplay(getHS(id));
  gameMeta.innerHTML = `<div>Category: <b>${g.cat}</b></div><div>Best: <b>${best}</b></div>`;
  showGame();
  const onHS = (score) => {
    const prev = getHS(id);
    if (typeof score === 'number') {
      if (prev === null || score > prev) {
        setHS(id, score);
        gameMeta.innerHTML = `<div>Category: <b>${g.cat}</b></div><div>Best: <b>${score}</b></div>`;
        renderGrid();
      }
    } else if (typeof score === 'string') {
      if (prev === null || prev !== score) {
        setHS(id, score);
        gameMeta.innerHTML = `<div>Category: <b>${g.cat}</b></div><div>Best: <b>${score}</b></div>`;
        renderGrid();
      }
    }
  };
  try {
    currentGameInit = () => g.init(gameRoot, onHS) || null;
    currentGameCleanup = currentGameInit();
  } catch (e) {
    console.error(e);
  }
  restartBtn.onclick = () => {
    if (currentGameInit) {
      cleanupCurrentGame();
      currentGameCleanup = currentGameInit();
    }
  };
}

// --- "About" button popup ---
$('#aboutBtn').onclick = () => {
  alert(`Mini Game Hub — Pro (Mobile+)\n\n• Optimized for touch (swipe, D-pad)\n• Canvas games respect Pause\n• High scores saved locally\nEnjoy!`);
};

// ========= Individual Game Logic =========
// Each game function is now clearly separated and commented.
// This is the easiest part to modify or add new games.

// 1) Clicker Game — Fun & Interactive
function initClicker(root, onHS) {
  const scoreEl = document.createElement('div');
  scoreEl.style.fontWeight = '700';
  scoreEl.style.margin = '8px';
  scoreEl.style.fontSize = '18px';

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Tap Me!';
  btn.style.transition = 'transform 0.1s, background 0.2s, left 0.2s, top 0.2s';
  btn.style.position = 'absolute';

  const reset = document.createElement('button');
  reset.className = 'btn secondary';
  reset.textContent = 'Reset';
  reset.style.marginTop = '50px';

  root.append(scoreEl, btn, reset);

  let score = 0;
  let streak = 0;
  let highScore = 0;
  let btnSize = 100;

  function updateScore() {
    scoreEl.textContent = `Score: ${score} | Streak: ${streak} | High: ${highScore}`;
  }

  function randomPosition() {
    const rect = root.getBoundingClientRect();
    const x = Math.random() * (rect.width - btnSize);
    const y = Math.random() * (rect.height - btnSize - 50); // leave space for reset button
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
  }

  btn.onclick = () => {
    streak++;
    score += 1 + Math.floor(streak / 3); // bonus for streaks
    if (score > highScore) highScore = score;

    // Animate button
    btn.style.transform = `scale(${1 + Math.random() * 0.3}) rotate(${Math.random() * 20 - 10}deg)`;
    btn.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;

    setTimeout(() => {
      btn.style.transform = '';
      btn.style.background = '';
      randomPosition();
    }, 150);

    beep('click');
    updateScore();
    onHS(score);
  };

  reset.onclick = () => {
    score = 0;
    streak = 0;
    btnSize = 100;
    updateScore();
    randomPosition();
  };

  // Start with random position
  randomPosition();
  updateScore();
}


// 2) Rock Paper Scissors Game
function initRPS(root, onHS) {
  root.innerHTML = `<p>Choose your move:</p>`;
  const res = document.createElement('p');
  ['Rock', 'Paper', 'Scissors'].forEach(m => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = m;
    b.onclick = () => play(m.toLowerCase());
    root.appendChild(b);
  });
  root.appendChild(res);

  function play(me) {
    const c = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    let r = '';
    if (me === c) r = "Tie!";
    else if ((me === 'rock' && c === 'scissors') || (me === 'paper' && c === 'rock') || (me === 'scissors' && c === 'paper')) {
      r = 'You win!';
      beep('win');
      onHS('Win');
    } else {
      r = 'Computer wins!';
      beep('lose');
    }
    res.textContent = `You chose ${me}, computer chose ${c}. ${r}`;
  }
  return () => { };
}

// 3)tic tac toe game
function initTicTacToe(root, onHS, level = 'easy') {
  const board = Array(9).fill(null);
  let current = 'X';

  const grid = document.createElement('div');
  grid.className = 'grid-ttt';

  const info = document.createElement('p');

  const reset = document.createElement('button');
  reset.className = 'btn secondary';
  reset.textContent = 'Restart';
  reset.onclick = restart;

  root.append(grid, info, reset);
  render();

  function render() {
    grid.innerHTML = '';
    board.forEach((v, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = v || '';
      if (!v && current === 'X') cell.onclick = () => move(i);
      grid.appendChild(cell);
    });
  }

  function move(i) {
    if (board[i] || current !== 'X') return;
    makeMove(i, 'X');
    if (!check()) {
      current = 'O';
      render();
      setTimeout(comp, 300);
    }
  }

  function comp() {
    if (!board.includes(null)) return;

    let idx;
    if (level === 'easy') {
      idx = randomMove();
    } else if (level === 'medium') {
      idx = blockOrRandom('O', 'X');
    } else { // hard
      idx = bestMove();
    }

    makeMove(idx, 'O');
    if (!check()) {
      current = 'X';
      render();
    }
  }

  function makeMove(i, player) {
    board[i] = player;
    beep(player === 'X' ? 'click' : 'click');
  }

  function randomMove() {
    const avail = board.reduce((acc, v, i) => v === null ? [...acc, i] : acc, []);
    return avail[Math.floor(Math.random() * avail.length)];
  }

  function blockOrRandom(ai, player) {
    // Check if AI can win
    const winMove = findWinningMove(ai);
    if (winMove !== null) return winMove;

    // Check if player can win next
    const blockMove = findWinningMove(player);
    if (blockMove !== null) return blockMove;

    return randomMove();
  }

  function bestMove() {
    // Try to win first, block second, pick center, else corner, else random
    const winMove = findWinningMove('O');
    if (winMove !== null) return winMove;

    const blockMove = findWinningMove('X');
    if (blockMove !== null) return blockMove;

    if (board[4] === null) return 4; // center

    const corners = [0, 2, 6, 8].filter(i => board[i] === null);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

    return randomMove();
  }

  function findWinningMove(player) {
    const wins = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of wins) {
      const line = [board[a], board[b], board[c]];
      if (line.filter(v => v === player).length === 2 && line.includes(null)) {
        return [a, b, c][line.indexOf(null)];
      }
    }
    return null;
  }

  function check() {
    const wins = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    for (const [a, b, c] of wins) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        info.textContent = `${board[a]} Wins!`;
        onHS(board[a] === 'X' ? 1 : 0);
        beep(board[a] === 'X' ? 'win' : 'lose');
        current = null;
        return true;
      }
    }

    if (!board.includes(null)) {
      info.textContent = 'Draw!';
      beep('lose');
      return true;
    }

    return false;
  }

  function restart() {
    board.fill(null);
    current = 'X';
    info.textContent = '';
    render();
  }

  return () => { }; // placeholder
}


// 4) Snake Game
function initSnake(root, onHS) {
  const cvs = document.createElement('canvas');
  cvs.width = 320;
  cvs.height = 320;
  const ctx = cvs.getContext('2d');
  root.appendChild(cvs);
  let snake = [{
    x: 160,
    y: 160
  }],
    food = {
      x: 80,
      y: 80
    },
    dx = 16,
    dy = 0,
    score = 0;
  let loop, speed = 110;

  function rnd() {
    return Math.floor(Math.random() * 20) * 16;
  }

  function resetFood() {
    food = {
      x: rnd(),
      y: rnd()
    };
  }

  function hit(a) {
    return snake.slice(1).some(p => p.x === a.x && p.y === a.y);
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x, food.y, 16, 16);
    ctx.fillStyle = 'lime';
    snake.forEach(p => ctx.fillRect(p.x, p.y, 16, 16));
    ctx.fillStyle = 'white';
    ctx.fillText('Score: ' + score, 10, 20);
  }

  function step() {
    if (GLOBAL_PAUSED) return;
    const head = {
      x: snake[0].x + dx,
      y: snake[0].y + dy
    };
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      beep('win');
      resetFood();
      if (speed > 70) speed -= 3;
    } else {
      snake.pop();
    }
    if (head.x < 0 || head.y < 0 || head.x >= cvs.width || head.y >= cvs.height || hit(head)) {
      clearInterval(loop);
      onHS(score);
      return;
    }
    draw();
  }

  function start() {
    loop = setInterval(step, speed);
  }

  function stop() {
    clearInterval(loop);
  }

  function setDir(dir) {
    if (dir === 'up' && dy === 0) {
      dx = 0;
      dy = -16
    } else if (dir === 'down' && dy === 0) {
      dx = 0;
      dy = 16
    } else if (dir === 'left' && dx === 0) {
      dx = -16;
      dy = 0
    } else if (dir === 'right' && dx === 0) {
      dx = 16;
      dy = 0
    }
  }
  const key = (e) => {
    if (e.key.startsWith('Arrow')) {
      setDir(e.key.replace('Arrow', '').toLowerCase());
    }
  };
  window.addEventListener('keydown', key);
  addSwipe(cvs, setDir);
  dpadHandler = setDir;
  toggleDpad(true);
  draw();
  start();
  resumeHook = () => {
    stop();
    start();
  };
  return () => {
    stop();
    window.removeEventListener('keydown', key);
    toggleDpad(false);
    dpadHandler = null;
  };
}

// 5) Number Guess Game
function initGuess(root, onHS) {
  const secret = Math.floor(Math.random() * 100) + 1;
  let tries = 0;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.min = 1;
  inp.max = 100;
  inp.placeholder = '1-100';
  inp.style.padding = '12px';
  inp.style.borderRadius = '10px';
  inp.inputMode = 'numeric';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Guess';
  const out = document.createElement('p');
  root.append(inp, btn, out);
  btn.onclick = () => {
    const g = Number(inp.value);
    if (!g) return;
    tries++;
    if (g === secret) {
      out.textContent = `Correct in ${tries} tries!`;
      beep('win');
      onHS(101 - tries);
    } else {
      out.textContent = g < secret ? 'Too low!' : 'Too high!';
      beep('click');
    }
  };
  return () => { };
}

// 6) Memory Match Game
function initMemory(root, onHS) {
  const symbols = ['🍎', '🍌', '🍇', '🍓', '🍒', '🥝', '🍍', '🥭'];
  const cards = [...symbols, ...symbols].sort(() => Math.random() - 0.5);
  const grid = document.createElement('div');
  grid.className = 'memory';
  const out = document.createElement('p');
  root.append(grid, out);
  let flipped = [];
  let found = 0;
  let clicks = 0;
  cards.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'mcard';
    d.textContent = '?';
    d.onclick = () => flip(i, d);
    grid.appendChild(d);
  });

  function flip(i, div) {
    if (flipped.length === 2 || div.textContent !== "?") return;
    div.textContent = cards[i];
    clicks++;
    flipped.push({
      i,
      div
    });
    if (flipped.length === 2) {
      if (cards[flipped[0].i] === cards[flipped[1].i]) {
        beep('win');
        found += 2;
        flipped = [];
        if (found === cards.length) {
          out.textContent = `All matched in ${clicks} flips!`;
          onHS(-clicks);
        }
      } else {
        beep('lose');
        setTimeout(() => {
          flipped[0].div.textContent = '?';
          flipped[1].div.textContent = '?';
          flipped = [];
        }, 600);
      }
    }
  }
  return () => { };
}
// 7) Reaction Timer Game
function initReaction(root, onHS) {
  const scoreDisplay = document.createElement('h3');
  const btn = document.createElement('button');
  btn.className = 'btn btn-large';
  root.append(scoreDisplay, btn);

  let score = 0;
  let streak = 0;
  let timeoutId = null;
  let btnSize = 100; // px
  let moving = false;

  scoreDisplay.textContent = `Score: ${score} | Streak: ${streak}`;

  function randomPosition() {
    const rect = root.getBoundingClientRect();
    const x = Math.random() * (rect.width - btnSize);
    const y = Math.random() * (rect.height - btnSize);
    btn.style.position = 'absolute';
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
  }

  function nextRound() {
    moving = true;

    // Set button size (shrinks as score increases)
    btnSize = Math.max(50, 100 - Math.floor(score / 50));
    btn.style.width = btn.style.height = btnSize + 'px';
    randomPosition();

    // Random color for challenge
    const rand = Math.random();
    if (rand < 0.6) btn.dataset.type = 'green';     // good
    else if (rand < 0.9) btn.dataset.type = 'red';  // bad
    else btn.dataset.type = 'blue';                 // mega bonus

    btn.style.background = btn.dataset.type;
    btn.textContent = btn.dataset.type === 'green' ? 'TAP!' :
      btn.dataset.type === 'red' ? 'DON’T TAP!' : 'MEGA!';

    // Timer: user must tap within 1.2s
    timeoutId = setTimeout(() => {
      if (moving && btn.dataset.type === 'green') {
        streak = 0;
        score = Math.max(0, score - 5);
        updateScore();
        nextRound();
      } else if (moving) {
        nextRound();
      }
    }, 1200);
  }

  function updateScore() {
    scoreDisplay.textContent = `Score: ${score} | Streak: ${streak}`;
  }

  btn.onclick = () => {
    if (!moving) return;

    const type = btn.dataset.type;
    if (type === 'green') {
      streak++;
      score += 10 + streak * 2;
      btn.style.transform = 'scale(1.2)';
      beep('win');
    } else if (type === 'blue') {
      streak++;
      score += 30 + streak * 3;
      btn.style.transform = 'scale(1.5)';
      beep('win');
    } else {
      streak = 0;
      score = Math.max(0, score - 10);
      btn.style.transform = 'scale(0.8)';
      beep('lose');
    }

    updateScore();
    moving = false;
    btn.style.background = '';
    btn.style.transform = '';
    onHS(-score);
    setTimeout(nextRound, 400);
  };

  btn.textContent = 'Start';
  btn.onclick = nextRound;
}

// 8) Math Quiz Game
function initMath(root, onHS) {
  let score = 0,
    q = 0;
  const total = 10;
  const p = document.createElement('p');
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.style.padding = '12px';
  inp.style.borderRadius = '10px';
  inp.inputMode = 'numeric';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Submit';
  const meta = document.createElement('div');
  meta.style.margin = '8px 0';
  root.append(p, inp, btn, meta);

  function next() {
    if (q === total) {
      p.textContent = `Done! Score: ${score}/${total}`;
      onHS(score);
      btn.disabled = true;
      return;
    }
    q++;
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const ans = (op === '+') ? a + b : (op === '-') ? a - b : a * b;
    p.dataset.ans = ans;
    p.textContent = `Q${q}: ${a} ${op} ${b} = ?`;
    inp.value = '';
    meta.textContent = `Score: ${score}`;
  }
  btn.onclick = () => {
    const v = Number(inp.value);
    if (inp.value === '') return;
    if (v == Number(p.dataset.ans)) {
      score++;
      beep('win');
    } else {
      beep('lose');
    }
    next();
  };
  next();
  return () => { };
}

// 9) Flappy Game
function initFlappy(root, onHS) {
  const cvs = document.createElement('canvas');
  cvs.width = 360;
  cvs.height = 480;
  const ctx = cvs.getContext('2d');
  root.appendChild(cvs);
  let x, y, vy, g, jump, pipes, frame, alive, score;

  function addPipe() {
    const gap = 120,
      top = 60 + Math.random() * 220;
    pipes.push({
      x: cvs.width,
      y: top,
      w: 52,
      gap
    });
  }

  function reset() {
    x = 80;
    y = 200;
    vy = 0;
    g = 0.5;
    jump = -8;
    pipes = [];
    frame = 0;
    alive = true;
    score = 0;
    for (let i = 0; i < 3; i++) {
      addPipe();
      pipes[i].x += i * 180;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#2a9d8f';
    pipes.forEach(p => {
      ctx.fillRect(p.x, 0, p.w, p.y);
      ctx.fillRect(p.x, p.y + p.gap, p.w, cvs.height);
    });
    ctx.fillStyle = 'yellow';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText('Score: ' + score, 10, 20);
    if (!alive) {
      ctx.fillText('Tap to restart', cvs.width / 2 - 40, cvs.height / 2);
    }
  }

  function loop() {
    if (GLOBAL_PAUSED) return requestAnimationFrame(loop);
    if (!alive) {
      draw();
      return requestAnimationFrame(loop);
    }
    frame++;
    if (frame % 120 === 0) addPipe();
    vy += g;
    y += vy;
    pipes.forEach(p => {
      p.x -= 2;
    });
    pipes = pipes.filter(p => p.x + p.w > -10);
    for (const p of pipes) {
      if (x + 12 > p.x && x - 12 < p.x + p.w) {
        if (y - 12 < p.y || y + 12 > p.y + p.gap) {
          alive = false;
          beep('lose');
          onHS(score);
        }
      }
      if (!p.passed && (p.x + p.w) < (x - 12)) {
        p.passed = true;
        score++;
        beep('win');
      }
    }
    if (y > cvs.height - 12 || y < 12) {
      alive = false;
      beep('lose');
      onHS(score);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function flap() {
    if (!alive) {
      reset();
    }
    vy = jump;
    beep('click');
  }
  cvs.addEventListener('pointerdown', flap);
  const keyHandler = e => {
    if (e.code === 'Space') flap();
  };
  window.addEventListener('keydown', keyHandler);
  reset();
  draw();
  requestAnimationFrame(loop);
  resumeHook = () => {
    requestAnimationFrame(loop);
  };
  return () => {
    cvs.removeEventListener('pointerdown', flap);
    window.removeEventListener('keydown', keyHandler);
  };
}

// 10) 2048 Game
function init2048(root, onHS) {
  const size = 4;
  let grid = Array.from({
    length: size
  }, () => Array(size).fill(0));
  const wrap = document.createElement('div');
  wrap.style.display = 'inline-grid';
  wrap.style.gridTemplateColumns = `repeat(${size},minmax(64px, 1fr))`;
  wrap.style.gap = '8px';
  wrap.style.maxWidth = '520px';
  wrap.style.width = '100%';
  const tiles = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const d = document.createElement('div');
      d.style.aspectRatio = '1 / 1';
      d.style.borderRadius = '10px';
      d.style.display = 'grid';
      d.style.placeItems = 'center';
      d.style.fontWeight = '700';
      d.style.fontSize = '1.2rem';
      d.style.background = '#e5e7eb';
      tiles.push(d);
      wrap.appendChild(d);
    }
  }
  const meta = document.createElement('p');
  const reset = document.createElement('button');
  reset.className = 'btn secondary';
  reset.textContent = 'Restart';
  reset.onclick = restart;
  root.append(wrap, meta, reset);

  function spawn() {
    const empty = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  function draw() {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const v = grid[r][c];
        const d = tiles[r * size + c];
        d.textContent = v || '';
        d.style.background = v ? `hsl(${(Math.log2(v) % 12) * 30},70%,70%)` : '#e5e7eb';
      }
    meta.textContent = 'Score: ' + score;
  }

  function slide(row) {
    row = row.filter(v => v);
    for (let i = 0; i < row.length - 1; i++) {
      if (row[i] === row[i + 1]) {
        row[i] *= 2;
        score += row[i];
        row[i + 1] = 0;
      }
    }
    return row.filter(v => v);
  }

  function move(dir) {
    let moved = false;
    if (dir === 'left' || dir === 'right') {
      for (let r = 0; r < size; r++) {
        let row = [...grid[r]];
        if (dir === 'right') row = row.reverse();
        row = slide(row);
        while (row.length < size) row.push(0);
        if (dir === 'right') row = row.reverse();
        const newRow = row;
        if (newRow.some((v, i) => v !== grid[r][i])) moved = true;
        grid[r] = newRow;
      }
    } else {
      for (let c = 0; c < size; c++) {
        let col = [];
        for (let r = 0; r < size; r++) col.push(grid[r][c]);
        col = (dir === 'down') ? col.reverse() : col;
        col = slide(col);
        while (col.length < size) col.push(0);
        if (dir === 'down') col = col.reverse();
        for (let r = 0; r < size; r++) {
          if (grid[r][c] !== col[r]) moved = true;
          grid[r][c] = col[r];
        }
      }
    }
    if (moved) {
      spawn();
      draw();
      if (checkOver()) {
        onHS(score);
      }
    }
  }

  function checkOver() {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] === 0) return false;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size - 1; c++)
        if (grid[r][c] === grid[r][c + 1]) return false;
    for (let c = 0; c < size; c++)
      for (let r = 0; r < size - 1; r++)
        if (grid[r][c] === grid[r + 1][c]) return false;
    return true;
  }

  function key(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      move(e.key.replace('Arrow', '').toLowerCase());
    }
  }

  function restart() {
    score = 0;
    grid = Array.from({
      length: size
    }, () => Array(size).fill(0));
    spawn();
    spawn();
    draw();
  }
  let score = 0;
  window.addEventListener('keydown', key);
  addSwipe(wrap, dir => {
    if (['up', 'down', 'left', 'right'].includes(dir)) move(dir);
  });
  restart();
  return () => {
    window.removeEventListener('keydown', key);
  };
}

// 11) Pong Game
function initPong(root, onHS) {
  const W = 480,
    H = 300,
    R = 8,
    P = 60,
    THICK = 8;
  const cvs = document.createElement('canvas');
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext('2d');
  root.appendChild(cvs);
  let bx = W / 2,
    by = H / 2,
    vx = 3,
    vy = 2.5,
    lp = H / 2,
    rp = H / 2,
    score = 0;
  let loopId = null;

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(10, lp - P / 2, THICK, P);
    ctx.fillRect(W - 10 - THICK, rp - P / 2, THICK, P);
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('Score: ' + score, 10, 14);
  }

  function step() {
    if (GLOBAL_PAUSED) return requestAnimationFrame(step);
    bx += vx;
    by += vy;
    if (by < R || by > H - R) vy *= -1;
    rp += Math.sign(by - rp) * 2.2;
    rp = Math.max(P / 2, Math.min(H - P / 2, rp));
    if (bx - R < 10 + THICK && Math.abs(by - lp) < P / 2) {
      vx = Math.abs(vx) + 0.2;
      vx *= -1;
      score++;
      beep('win');
    }
    if (bx + R > W - 10 - THICK && Math.abs(by - rp) < P / 2) {
      vx = -(Math.abs(vx) + 0.2);
      beep('click');
    }
    if (bx < 0 || bx > W) {
      onHS(score);
      score = 0;
      bx = W / 2;
      by = H / 2;
      vx = 3 * (Math.random() < 0.5 ? -1 : 1);
      vy = 2 * (Math.random() < 0.5 ? -1 : 1);
      beep('lose');
    }
    draw();
    requestAnimationFrame(step);
  }

  function setLP(y) {
    lp = Math.max(P / 2, Math.min(H - P / 2, y));
  }

  function pointer(e) {
    const rect = cvs.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height * H;
    setLP(y);
  }
  cvs.addEventListener('pointerdown', pointer);
  cvs.addEventListener('pointermove', pointer);
  draw();
  requestAnimationFrame(step);
  resumeHook = () => {
    requestAnimationFrame(step);
  };
  return () => {
    cvs.removeEventListener('pointerdown', pointer);
    cvs.removeEventListener('pointermove', pointer);
  };
}

// 12) Whack-a-Mole Game
function initWhack(root, onHS) {
  const rows = 3,
    cols = 3,
    cells = [],
    dur = 1500;
  let score = 0,
    time = 30,
    timer = null,
    active = -1;
  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = `repeat(${cols}, 90px)`;
  wrap.style.gap = '10px';
  wrap.style.justifyContent = 'center';
  for (let i = 0; i < rows * cols; i++) {
    const d = document.createElement('button');
    d.className = 'padbtn';
    d.style.width = '90px';
    d.style.height = '90px';
    d.textContent = '';
    d.onclick = () => {
      if (i === active) {
        score++;
        beep('win');
        d.textContent = '💥';
        active = -1;
      }
    };
    cells.push(d);
    wrap.appendChild(d);
  }
  const meta = document.createElement('p');
  meta.style.textAlign = 'center';
  const startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = 'Start';
  root.append(wrap, meta, startBtn);
  updateMeta();

  function updateMeta() {
    meta.textContent = `Score: ${score} • Time: ${time}s`;
  }

  function tick() {
    if (GLOBAL_PAUSED) return;
    cells.forEach(c => c.textContent = '');
    active = Math.floor(Math.random() * cells.length);
    cells[active].textContent = '🐹';
  }

  function gameLoop() {
    if (GLOBAL_PAUSED) return;
    time--;
    updateMeta();
    if (time <= 0) {
      end();
      return;
    }
  }

  function start() {
    score = 0;
    time = 30;
    updateMeta();
    tick();
    timer = setInterval(() => {
      tick();
      gameLoop();
    }, 1000);
  }

  function end() {
    clearInterval(timer);
    timer = null;
    active = -1;
    cells.forEach(c => c.textContent = '');
    onHS(score);
  }
  startBtn.onclick = () => {
    if (timer) {
      end();
    }
    start();
  };
  return () => {
    if (timer) clearInterval(timer);
  };
}

// 13) Sudoku Mini (4x4) Game
function initSudoku(root, onHS) {
  const VALID_SOLUTION = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ];
  const START = [
    [1, 0, 0, 4],
    [0, 4, 1, 0],
    [0, 1, 4, 0],
    [3, 0, 0, 2]
  ];
  const info = document.createElement('p');
  const grid = document.createElement('div');
  grid.className = 'sudoku-grid';
  const inputs = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = START[r][c];
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = 1;
      inp.max = 4;
      inp.inputMode = 'numeric';
      if (val) {
        inp.value = val;
        inp.disabled = true;
        inp.style.fontWeight = '700';
      }
      grid.appendChild(inp);
      inputs.push({
        el: inp,
        r,
        c
      });
    }
  }
  const btnCheck = document.createElement('button');
  btnCheck.className = 'btn';
  btnCheck.textContent = 'Check';
  const btnSolve = document.createElement('button');
  btnSolve.className = 'btn secondary';
  btnSolve.textContent = 'Show Solution';
  const timerEl = document.createElement('p');
  root.append(grid, timerEl, info, btnCheck, btnSolve);
  let startTime = performance.now();
  const timerInterval = setInterval(() => {
    const s = Math.floor((performance.now() - startTime) / 1000);
    timerEl.textContent = `Time: ${s}s`;
  }, 500);

  function readGrid() {
    const out = Array.from({
      length: 4
    }, () => Array(4).fill(0));
    inputs.forEach(it => {
      const v = Number(it.el.value) || 0;
      out[it.r][it.c] = v;
    });
    return out;
  }

  function checkCorrect(arr) {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (arr[r][c] !== VALID_SOLUTION[r][c]) return false;
    return true;
  }
  btnCheck.onclick = () => {
    const g = readGrid();
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        if (g[r][c] < 1 || g[r][c] > 4) {
          info.textContent = 'Fill all cells with numbers 1–4';
          beep('lose');
          return;
        }
      }
    if (checkCorrect(g)) {
      const secs = Math.floor((performance.now() - startTime) / 1000);
      info.textContent = `Solved! ${secs}s`;
      beep('win');
      clearInterval(timerInterval);
      onHS(1000 - secs);
    } else {
      info.textContent = 'Not correct — try again!';
      beep('lose');
    }
  };
  btnSolve.onclick = () => {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const idx = r * 4 + c;
        inputs[idx].el.value = VALID_SOLUTION[r][c];
      }
    info.textContent = 'Solution revealed';
    beep('click');
    clearInterval(timerInterval);
  };
  return () => {
    clearInterval(timerInterval);
  };
}

// 14) Sliding Puzzle (3x3) Game
function initSliding(root, onHS) {
  const wrap = document.createElement('div');
  wrap.className = 'sliding';
  const info = document.createElement('p');
  const btnShuffle = document.createElement('button');
  btnShuffle.className = 'btn';
  btnShuffle.textContent = 'Shuffle';
  const btnSolve = document.createElement('button');
  btnSolve.className = 'btn secondary';
  btnSolve.textContent = 'Reset';
  root.append(wrap, info, btnShuffle, btnSolve);
  let tiles = [];
  const size = 3;
  let moves = 0;

  function mkTiles(arr) {
    wrap.innerHTML = '';
    tiles = arr.slice();
    for (let i = 0; i < tiles.length; i++) {
      const v = tiles[i];
      const d = document.createElement('div');
      d.className = 'tile';
      if (v === 0) {
        d.textContent = '';
        d.style.visibility = 'hidden';
      } else {
        d.textContent = v;
      }
      d.dataset.index = i;
      d.onclick = () => tryMove(i);
      wrap.appendChild(d);
    }
    info.textContent = `Moves: ${moves}`;
  }

  function neighbors(idx) {
    const r = Math.floor(idx / size),
      c = idx % size;
    const list = [];
    if (r > 0) list.push((r - 1) * size + c);
    if (r < size - 1) list.push((r + 1) * size + c);
    if (c > 0) list.push(r * size + (c - 1));
    if (c < size - 1) list.push(r * size + (c + 1));
    return list;
  }

  function tryMove(i) {
    const empty = tiles.indexOf(0);
    if (neighbors(i).includes(empty)) {
      [tiles[i], tiles[empty]] = [tiles[empty], tiles[i]];
      mkTiles(tiles);
      moves++;
      info.textContent = `Moves: ${moves}`;
      beep('click');
      checkSolved();
    }
  }

  function shuffle() {
    let arr = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    do {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } while (!isSolvable(arr));
    moves = 0;
    mkTiles(arr);
  }

  function isSolvable(arr) {
    const a = arr.filter(x => x !== 0);
    let inv = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) inv++;
    return inv % 2 === 0;
  }

  function checkSolved() {
    const goal = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    if (tiles.every((v, i) => v === goal[i])) {
      info.textContent = `Solved in ${moves} moves!`;
      beep('win');
      onHS(10000 - moves);
    }
  }

  btnShuffle.onclick = shuffle;
  btnSolve.onclick = () => {
    moves = 0;
    mkTiles([1, 2, 3, 4, 5, 6, 7, 8, 0]);
  };
  shuffle();
  return () => { };
}