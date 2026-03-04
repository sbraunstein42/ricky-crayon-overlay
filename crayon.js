(function () {

  // ── Grab elements from the page ──────────────────────────────────────────
  const canvas   = document.getElementById('crayon-canvas');
  const ctx      = canvas.getContext('2d');
  const cursor   = document.getElementById('crayon-cursor');
  const toggle   = document.getElementById('draw-toggle');
  const clearBtn = document.getElementById('clear-btn');
  const hint     = document.getElementById('hint');

  // ── State ────────────────────────────────────────────────────────────────
  let drawing   = false;  // is draw mode currently on?
  let isDown    = false;  // is the mouse/finger pressed right now?
  let lastX     = 0;
  let lastY     = 0;
  let color     = '#ef233c';  // default: red crayon
  let brushSize = 14;         // default: medium

  // ── Crayon colour palette ────────────────────────────────────────────────
  const COLORS = [
    '#ef233c',  // red
    '#ff6b35',  // orange
    '#ffd166',  // yellow
    '#06d6a0',  // green
    '#118ab2',  // blue
    '#7b2d8b',  // purple
    '#ffffff',  // white
    '#111111',  // black
  ];

  // ── Brush size options ───────────────────────────────────────────────────
  const SIZES = [
    { label: 'Small',  d: 8,  dot: 6  },
    { label: 'Medium', d: 14, dot: 10 },
    { label: 'Large',  d: 22, dot: 16 },
  ];


  // ── Canvas resize ────────────────────────────────────────────────────────
  // Keeps the canvas filling the whole window; preserves existing drawings.
  function resizeCanvas() {
    const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.putImageData(saved, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);


  // ── Build colour swatches in the toolbar ─────────────────────────────────
  const swatchContainer = document.getElementById('swatches');

  COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch' + (c === color ? ' active' : '');
    swatch.style.background = c;

    // white swatch needs a visible border so it doesn't disappear
    if (c === '#ffffff') swatch.style.boxShadow = 'inset 0 0 0 2px #ccc';

    swatch.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      color = c;
    });

    swatchContainer.appendChild(swatch);
  });


  // ── Build brush-size buttons in the toolbar ──────────────────────────────
  const sizeContainer = document.getElementById('sizes');

  SIZES.forEach(sz => {
    const btn = document.createElement('button');
    btn.className    = 'size-btn' + (sz.d === brushSize ? ' active' : '');
    btn.style.width  = (sz.d + 16) + 'px';
    btn.style.height = (sz.d + 16) + 'px';
    btn.title        = sz.label;

    // visual dot inside the button
    const dot = document.createElement('div');
    dot.className    = 'dot';
    dot.style.width  = sz.dot + 'px';
    dot.style.height = sz.dot + 'px';
    btn.appendChild(dot);

    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSize = sz.d;
    });

    sizeContainer.appendChild(btn);
  });


  // ── Draw-mode toggle ─────────────────────────────────────────────────────
  toggle.addEventListener('click', () => {
    drawing = !drawing;

    // allow/block mouse events on the canvas
    canvas.style.pointerEvents = drawing ? 'all' : 'none';

    // show/hide custom crayon cursor
    cursor.style.display       = drawing ? 'block' : 'none';
    document.body.style.cursor = drawing ? 'none'  : '';

    // update button label & colour
    toggle.textContent = drawing ? '🛑 Stop Drawing' : '✏️ Start Drawing';
    toggle.classList.toggle('drawing', drawing);

    // hide the hint tip
    hint.classList.add('hidden');
  });


  // ── Clear button ─────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });


  // ── Auto-hide the hint after 5 seconds ───────────────────────────────────
  setTimeout(() => hint.classList.add('hidden'), 5000);


  // ── Core drawing: textured crayon stroke ─────────────────────────────────
  // Draws from (x0,y0) to (x1,y1) with a waxy, grainy crayon look.
  function crayonStroke(x0, y0, x1, y1) {
    const dist   = Math.hypot(x1 - x0, y1 - y0);
    const steps  = Math.max(1, Math.floor(dist / 2));
    const jitter = brushSize * 0.35;  // how wobbly the stroke edges are

    ctx.save();
    ctx.globalAlpha = 0.18;   // semi-transparent so layers build up
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = color;

    // Draw 4 slightly-offset strokes to simulate wax texture
    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      ctx.moveTo(
        x0 + (Math.random() - .5) * jitter,
        y0 + (Math.random() - .5) * jitter
      );
      for (let s = 1; s <= steps; s++) {
        const t  = s / steps;
        const mx = x0 + (x1 - x0) * t + (Math.random() - .5) * jitter;
        const my = y0 + (y1 - y0) * t + (Math.random() - .5) * jitter;
        ctx.lineTo(mx, my);
      }
      ctx.stroke();
    }

    // Scatter tiny dots along the path for paper-grain texture
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = color;
    for (let g = 0; g < dist * 0.6; g++) {
      const t  = Math.random();
      const gx = x0 + (x1 - x0) * t + (Math.random() - .5) * brushSize * 0.8;
      const gy = y0 + (y1 - y0) * t + (Math.random() - .5) * brushSize * 0.8;
      const r  = Math.random() * brushSize * 0.25;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }


  // ── Pointer position helper (works for mouse and touch) ──────────────────
  function getPos(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }


  // ── Canvas pointer events ─────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', e => {
    if (!drawing) return;
    isDown = true;
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
    crayonStroke(p.x, p.y, p.x + .1, p.y + .1);  // dot on single tap/click
  });

  canvas.addEventListener('pointermove', e => {
    const p = getPos(e);

    // always move the custom cursor emoji
    cursor.style.left = p.x + 'px';
    cursor.style.top  = p.y + 'px';

    if (!drawing || !isDown) return;
    crayonStroke(lastX, lastY, p.x, p.y);
    lastX = p.x;
    lastY = p.y;
  });

  canvas.addEventListener('pointerup',    () => { isDown = false; });
  canvas.addEventListener('pointerleave', () => { isDown = false; });

  // Track cursor position even when draw mode is off (canvas doesn't receive events then)
  window.addEventListener('mousemove', e => {
    if (drawing) return;  // canvas already handles it above
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

})();
