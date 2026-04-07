(function () {

  // ── Crayon texture controls ───────────────────────────────────────────────
  const HOLES_PER_INCH = 100;   // hole density (96px = 1 inch at standard screen DPI)
  const HOLE_SIZE_MIN  = 0.03; // smallest hole radius as fraction of brush size
  const HOLE_SIZE_MAX  = 0.15; // largest hole radius as fraction of brush size
  const HOLE_VERTS     = 9;    // vertices per jagged hole polygon
  const HOLE_JITTER    = 0.70; // raggedness: 0 = smooth circle, 1 = very spiky

  const STROKE_WIDTH_MIN   = 0.70; // narrowest point as fraction of brushSize
  const STROKE_WIDTH_MAX   = 1.30; // widest point as fraction of brushSize
  const STROKE_EDGE_JITTER = 0.38; // per-point edge roughness as fraction of brushSize (0 = smooth)

  const BAKE_INTERVAL  = 150;  // px: auto-bake stroke into the canvas every N pixels to protect old marks

  const HOLE_ANGLE_MIN = -.5;   // min extra hole rotation in radians
  const HOLE_ANGLE_MAX = .5;   // max extra hole rotation in radians
  const HOLE_TAPER_MIN = -.75;   // min taper: 0 = symmetric, -1 = flipped triangle
  const HOLE_TAPER_MAX = .75;   // max taper: 1 = triangle, higher = more extreme

  // ── Cursor offset — shift where the crayon tip aligns with the pointer ────
  // Positive X moves the tip right, positive Y moves it down.
  const CURSOR_OFFSET_X = 8;   // px horizontal
  const CURSOR_OFFSET_Y = -13;  // px vertical

  // ── Stroke transparency ───────────────────────────────────────────────────
  const SHOW_ALPHA_SLIDER = false;  // set false to hide the slider entirely
  let   strokeAlpha       = 0.60;   // default opacity (0 = invisible, 1 = fully opaque)

  // ── Sprite base URL (resolves relative to this script, works locally + GitHub Pages) ──
  const _s = document.currentScript;
  const SPRITE_BASE = _s ? _s.src.replace(/\/[^\/]+$/, '/') + 'sprites/' : 'sprites/';

  const canvas   = document.getElementById('crayon-canvas');
  const ctx      = canvas.getContext('2d');
  const cursor   = document.getElementById('crayon-cursor');
  const stopBtn  = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const rack     = document.getElementById('crayon-rack');
  const hint     = document.getElementById('hint');

  let drawing     = false;
  let isDown      = false;
  let lastX       = 0, lastY = 0;
  let color       = '#d93025';
  const brushSize = 14;

  // ── Three canvases ───────────────────────────────────────────────────────
  //
  //  offscreen  — permanent record of all completed strokes, in PAGE space.
  //               Grows to fit the full page. Written once per stroke.
  //
  //  scratch    — the stroke currently being drawn, in VIEWPORT space.
  //               Cleared on every pointerup.
  //
  //  canvas     — the visible canvas. Each RAF frame:
  //               1. Clear
  //               2. drawImage(offscreen) shifted by -scrollX/Y  (one fast blit)
  //               3. drawImage(scratch) on top  (one fast blit)
  //
  const offscreen = document.createElement('canvas');
  const octx      = offscreen.getContext('2d');

  const scratch   = document.createElement('canvas');
  const sctx      = scratch.getContext('2d');

  // ── Crayon definitions ───────────────────────────────────────────────────
  const CRAYONS = [
    { color: '#f4a0b5', sprite: '1 LT PINK CRAYON.png',  name: 'Lt Pink' },
    { color: '#d93025', sprite: '2 RED CRAYON.png',      name: 'Red'     },
    { color: '#f97316', sprite: '3 ORANGE CRAYON.png',   name: 'Orange'  },
    { color: '#fbbf24', sprite: '4 YELLOW CRAYON.png',   name: 'Yellow'  },
    { color: '#22c55e', sprite: '5 GREEN CRAYON.png',    name: 'Green'   },
    { color: '#3b82f6', sprite: '6 BLUE CRAYON.png',     name: 'Blue'    },
    { color: '#c026d3', sprite: '7 DK PINK CRAYON.png',  name: 'Dk Pink' },
    { color: '#9ca3af', sprite: '8 GREY CRAYON.png',     name: 'Grey'    },
    { color: '#92400e', sprite: '9 BROWN CRAYON.png',    name: 'Brown'   },
  ];

  // ── Resize helpers ───────────────────────────────────────────────────────
  function resizeViewportCanvases() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    scratch.width  = window.innerWidth;
    scratch.height = window.innerHeight;
  }

  // Offscreen must cover the full page so marks anywhere on the page are stored.
  function resizeOffscreen() {
    const W = document.documentElement.scrollWidth;
    const H = document.documentElement.scrollHeight;
    if (offscreen.width === W && offscreen.height === H) return;
    // Save existing content, resize, restore
    const saved = offscreen.width > 0
      ? octx.getImageData(0, 0, offscreen.width, offscreen.height)
      : null;
    offscreen.width  = W;
    offscreen.height = H;
    if (saved) octx.putImageData(saved, 0, 0);
  }

  resizeViewportCanvases();
  resizeOffscreen();
  window.addEventListener('resize', () => {
    resizeViewportCanvases();
    resizeOffscreen();
  });

  // ── RAF loop — just two blits per frame ──────────────────────────────────
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, -window.scrollX, -window.scrollY);
    ctx.drawImage(scratch, 0, 0);
    requestAnimationFrame(redraw);
  }
  requestAnimationFrame(redraw);

  // ── Seeded pseudo-random — deterministic texture per stroke ──────────────
  function seededRand(n) {
    const x = Math.sin(n + 1) * 43758.5453123;
    return x - Math.floor(x);
  }

  // ── Jagged hole shape — irregular polygon approximating an ellipse ───────
  function jaggedHole(ctx2d, cx, cy, hw, hh, angle, seed) {
    const angleOffset = HOLE_ANGLE_MIN + seededRand(seed + 40) * (HOLE_ANGLE_MAX - HOLE_ANGLE_MIN);
    const taper       = HOLE_TAPER_MIN + seededRand(seed + 41) * (HOLE_TAPER_MAX - HOLE_TAPER_MIN);
    const a = angle + angleOffset;
    ctx2d.beginPath();
    for (let v = 0; v < HOLE_VERTS; v++) {
      const t    = (v / HOLE_VERTS) * Math.PI * 2;
      const sinT = Math.sin(t);
      const taperedHW = hw * (1 + taper * sinT);
      const r    = 1 + (seededRand(seed + v * 3) - 0.5) * HOLE_JITTER * 2;
      const ex   = Math.cos(t) * taperedHW * r;
      const ey   = sinT        * hh        * r;
      const x    = cx + ex * Math.cos(a) - ey * Math.sin(a);
      const y    = cy + ex * Math.sin(a) + ey * Math.cos(a);
      v === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
    }
    ctx2d.closePath();
    ctx2d.fill();
  }

  // ── Core crayon rendering — filled shape with paper-grain holes ─────────
  //
  // A crayon on paper is a single opaque-ish wax mark with slightly rough
  // edges and paper grain showing through as thin gaps.
  // We fill a jittered polygon, then destination-out thin slices across it.
  //
  function drawCrayonStroke(ctx2d, pts, strokeColor, size, seed) {
    if (pts.length < 1) return;
    const r = size / 2;
    ctx2d.save();
    ctx2d.globalAlpha = strokeAlpha;
    ctx2d.fillStyle   = strokeColor;

    if (pts.length === 1) {
      ctx2d.beginPath();
      ctx2d.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
      return;
    }

    // Jittered left/right edges with smoothly-varying width along the stroke
    const left  = new Array(pts.length);
    const right = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i > 0 ? i - 1 : 0];
      const next = pts[i < pts.length - 1 ? i + 1 : pts.length - 1];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;

      // Smooth width variation: linearly interpolate between two slow samples
      const k  = i / 5;
      const k0 = Math.floor(k), k1 = k0 + 1;
      const v0 = seededRand(seed + k0 * 11 + 200);
      const v1 = seededRand(seed + k1 * 11 + 200);
      const wave = v0 + (v1 - v0) * (k - k0);
      const wR = r * (STROKE_WIDTH_MIN + wave * (STROKE_WIDTH_MAX - STROKE_WIDTH_MIN));

      const jL = (seededRand(seed + i * 3)     - 0.5) * size * STROKE_EDGE_JITTER;
      const jR = (seededRand(seed + i * 3 + 1) - 0.5) * size * STROKE_EDGE_JITTER;
      left[i]  = { x: pts[i].x + px * (wR + jL), y: pts[i].y + py * (wR + jL) };
      right[i] = { x: pts[i].x - px * (wR + jR), y: pts[i].y - py * (wR + jR) };
    }

    ctx2d.beginPath();
    ctx2d.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < pts.length; i++) ctx2d.lineTo(left[i].x, left[i].y);
    for (let i = pts.length - 1; i >= 0; i--) ctx2d.lineTo(right[i].x, right[i].y);
    ctx2d.closePath();
    ctx2d.fill();

    ctx2d.beginPath();
    ctx2d.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, r, 0, Math.PI * 2);
    ctx2d.fill();

    // Static grain: small jagged holes scattered anywhere across the stroke height
    ctx2d.globalCompositeOperation = 'destination-out';
    ctx2d.globalAlpha = 1;
    ctx2d.fillStyle   = 'black';
    const holeSpacing = 96 / HOLES_PER_INCH; // px between holes (96px ≈ 1 inch)
    let dist     = 0;
    let nextHole = seededRand(seed + 500) * holeSpacing;
    let holeIdx  = 0;
    for (let i = 1; i < pts.length; i++) {
      const sdx = pts[i].x - pts[i - 1].x;
      const sdy = pts[i].y - pts[i - 1].y;
      const segLen = Math.hypot(sdx, sdy);
      dist += segLen;
      while (dist >= nextHole) {
        const t     = segLen > 0 ? 1 - (dist - nextHole) / segLen : 0;
        const angle = Math.atan2(sdy, sdx);
        // Random perpendicular offset — scatter holes anywhere across the stroke height
        const perp  = (seededRand(seed + holeIdx * 5 + 4) - 0.5) * size * 0.85;
        const hx    = pts[i - 1].x + sdx * t - Math.sin(angle) * perp;
        const hy    = pts[i - 1].y + sdy * t + Math.cos(angle) * perp;
        const hSize = size * (HOLE_SIZE_MIN + seededRand(seed + holeIdx * 5 + 1) * (HOLE_SIZE_MAX - HOLE_SIZE_MIN));
        jaggedHole(ctx2d, hx, hy, hSize, hSize, angle, seed + holeIdx * 17);
        nextHole += holeSpacing + (seededRand(seed + holeIdx * 5 + 3) - 0.5) * holeSpacing * 0.4;
        holeIdx++;
      }
    }

    ctx2d.restore();
  }

  // ── Bake a completed stroke onto the offscreen canvas ────────────────────
  // Uses a temp canvas so destination-out holes only cut through this stroke,
  // not previously baked content on octx.
  function bakeStroke(stroke) {
    const pts = stroke.points;
    if (pts.length < 1) return;

    let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    const pad = stroke.size * 2;
    minX = Math.max(0,                Math.floor(minX - pad));
    minY = Math.max(0,                Math.floor(minY - pad));
    maxX = Math.min(offscreen.width,  Math.ceil(maxX  + pad));
    maxY = Math.min(offscreen.height, Math.ceil(maxY  + pad));

    const tmp    = document.createElement('canvas');
    tmp.width    = maxX - minX;
    tmp.height   = maxY - minY;
    const tmpCtx = tmp.getContext('2d');
    const localPts = pts.map(p => ({ x: p.x - minX, y: p.y - minY }));
    drawCrayonStroke(tmpCtx, localPts, stroke.color, stroke.size, stroke.seed);
    octx.drawImage(tmp, minX, minY);
  }

  // ── Redraw the active stroke onto scratch ─────────────────────────────────
  // Clears and redraws from all stored points so strands never
  // accumulate and darken as the user draws slowly.
  function redrawScratch(points, seed) {
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    if (points.length < 1) return;

    // Convert page-space points to viewport space for the scratch canvas
    const sx = window.scrollX, sy = window.scrollY;
    const pts = points.map(p => ({ x: p.x - sx, y: p.y - sy }));
    drawCrayonStroke(sctx, pts, color, brushSize, seed);
  }

  // ── Build crayon rack from sprite images ──────────────────────────────────
  CRAYONS.forEach(cr => {
    const el = document.createElement('div');
    el.className = 'crayon';
    el.title     = cr.name;

    const img = document.createElement('img');
    img.src = SPRITE_BASE + cr.sprite;
    img.alt = cr.name;
    el.appendChild(img);

    el.addEventListener('click', () => {
      color = cr.color;
      // Update the cursor to show the selected crayon
      const cursorImg = cursor.querySelector('img');
      if (cursorImg) cursorImg.src = SPRITE_BASE + cr.sprite;
      document.querySelectorAll('.crayon').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      startDrawing();
    });

    rack.appendChild(el);
  });

  // ── Swap button and hint elements to use sprites ──────────────────────────
  stopBtn.innerHTML  = `<img src="${SPRITE_BASE}STOP COLORING BUTTON.png" alt="Stop Coloring">`;
  clearBtn.innerHTML = `<img src="${SPRITE_BASE}CLEAR BUTTON.png" alt="Clear">`;
  if (hint) hint.innerHTML = `<img src="${SPRITE_BASE}PICK A CRAYON BUTTON.png" alt="Pick a crayon!">`;

  // Replace emoji cursor with an image (initially the first crayon)
  cursor.innerHTML = `<img src="${SPRITE_BASE}${CRAYONS[0].sprite}" alt="crayon">`;

  // ── Draw mode ────────────────────────────────────────────────────────────
  function startDrawing() {
    drawing = true;
    canvas.style.pointerEvents = 'all';
    cursor.style.display       = 'block';
    document.body.style.cursor = 'none';
    rack.style.opacity         = '0';
    rack.style.pointerEvents   = 'none';
    stopBtn.style.display      = 'block';
    clearBtn.style.display     = 'block';
    hint.classList.add('hidden');
  }

  function stopDrawing() {
    drawing = false;
    isDown  = false;
    canvas.style.pointerEvents = 'none';
    cursor.style.display       = 'none';
    document.body.style.cursor = '';
    rack.style.opacity         = '1';
    rack.style.pointerEvents   = 'auto';
    stopBtn.style.display      = 'none';
    clearBtn.style.display     = 'none';
    hint.classList.remove('hidden');
    document.querySelectorAll('.crayon').forEach(c => c.classList.remove('active'));
  }

  stopBtn.addEventListener('click', stopDrawing);
  clearBtn.addEventListener('click', () => {
    octx.clearRect(0, 0, offscreen.width, offscreen.height);
    sctx.clearRect(0, 0, scratch.width, scratch.height);
  });
  setTimeout(() => hint.classList.add('hidden'), 5000);

  // ── Pointer events ────────────────────────────────────────────────────────
  let activeStroke = null;

  // Raw viewport coordinates — used to position fixed DOM elements like the cursor.
  function getViewportPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX, y: touch.clientY };
  }

  // Canvas-local pixel coordinates — accounts for the canvas's actual position
  // and CSS scale relative to the viewport. Fixes offset on mobile / Wix.
  function getClientPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    const rect  = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) * (canvas.width  / rect.width),
      y: (touch.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function getPagePos(e) {
    const client = getClientPos(e);
    return { x: client.x + window.scrollX, y: client.y + window.scrollY };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!drawing) return;
    isDown = true;
    resizeOffscreen();
    const page = getPagePos(e);
    lastX = getClientPos(e).x; lastY = getClientPos(e).y;
    activeStroke = { color, size: brushSize, seed: Math.floor(Math.random() * 1e9), points: [page], dist: 0 };
    redrawScratch(activeStroke.points, activeStroke.seed);
  });

  canvas.addEventListener('pointermove', e => {
    const vp     = getViewportPos(e);
    const client = getClientPos(e);
    cursor.style.left = (vp.x + CURSOR_OFFSET_X) + 'px';
    cursor.style.top  = (vp.y + CURSOR_OFFSET_Y) + 'px';
    if (!drawing || !isDown || !activeStroke) return;
    const moved = Math.hypot(client.x - lastX, client.y - lastY);
    if (moved > 2) {
      activeStroke.points.push(getPagePos(e));
      activeStroke.dist += moved;

      // Auto-bake when the stroke gets long enough — protects old marks from
      // accumulating too many holes. Carry the last 2 points into the new segment
      // so the seam is seamless.
      if (activeStroke.dist >= BAKE_INTERVAL && activeStroke.points.length > 2) {
        bakeStroke(activeStroke);
        activeStroke = {
          color, size: brushSize,
          seed: Math.floor(Math.random() * 1e9),
          points: activeStroke.points.slice(-2),
          dist: 0,
        };
      }

      redrawScratch(activeStroke.points, activeStroke.seed);
      lastX = client.x; lastY = client.y;
    }
  });

  function commitStroke() {
    isDown = false;
    if (activeStroke && activeStroke.points.length >= 1) {
      bakeStroke(activeStroke);
    }
    activeStroke = null;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
  }

  canvas.addEventListener('pointerup',    commitStroke);
  canvas.addEventListener('pointerleave', commitStroke);

  window.addEventListener('mousemove', e => {
    if (drawing) return;
    cursor.style.left = (e.clientX + CURSOR_OFFSET_X) + 'px';
    cursor.style.top  = (e.clientY + CURSOR_OFFSET_Y) + 'px';
  });

  // ── Opacity slider (client preview tool — set SHOW_ALPHA_SLIDER = false to hide) ──
  if (SHOW_ALPHA_SLIDER) {
    const panel = document.createElement('div');
    panel.id = 'crayon-alpha-panel';
    Object.assign(panel.style, {
      position:     'fixed',
      bottom:       '20px',
      right:        '20px',
      zIndex:       '10002',
      background:   'rgba(255,255,255,0.90)',
      border:       '1px solid #ccc',
      borderRadius: '10px',
      padding:      '10px 16px 12px',
      boxShadow:    '0 2px 10px rgba(0,0,0,0.18)',
      fontFamily:   'sans-serif',
      fontSize:     '12px',
      color:        '#333',
      userSelect:   'none',
      lineHeight:   '1.4',
    });

    const label = document.createElement('div');
    label.textContent = 'Stroke opacity';
    label.style.marginBottom = '6px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = '0';
    slider.max   = '100';
    slider.value = Math.round(strokeAlpha * 100);
    slider.style.width = '130px';

    const valueLabel = document.createElement('span');
    valueLabel.textContent = slider.value + '%';
    valueLabel.style.minWidth = '34px';

    slider.addEventListener('input', () => {
      strokeAlpha = slider.value / 100;
      valueLabel.textContent = slider.value + '%';
    });

    row.appendChild(slider);
    row.appendChild(valueLabel);
    panel.appendChild(label);
    panel.appendChild(row);
    document.body.appendChild(panel);
  }

})();
