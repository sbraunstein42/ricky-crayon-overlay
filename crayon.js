(function () {

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

  // ── Core chalk rendering — filled polygon with jittered edges ────────────
  //
  // Real chalk on a chalkboard is a single opaque mark with rough, uneven edges.
  // We model it as a filled polygon rather than a stroked line:
  //
  //   For each input point we compute a perpendicular unit vector, then offset
  //   left and right by (radius + seeded jitter). The resulting polygon is
  //   filled at full opacity — one fill call, no transparency, naturally uneven.
  //   Two filled circles cap the start and end.
  //
  // The seed keeps jitter deterministic so scratch redraws are stable.
  //
  function drawChalkStroke(ctx2d, pts, strokeColor, size, seed) {
    if (pts.length < 1) return;

    const r = size / 2;

    ctx2d.save();
    ctx2d.fillStyle = strokeColor;

    if (pts.length === 1) {
      ctx2d.beginPath();
      ctx2d.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
      return;
    }

    // Build left and right edge arrays with seeded perpendicular jitter
    const left  = new Array(pts.length);
    const right = new Array(pts.length);

    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i > 0 ? i - 1 : 0];
      const next = pts[i < pts.length - 1 ? i + 1 : pts.length - 1];
      const dx  = next.x - prev.x;
      const dy  = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const px  = -dy / len;   // perpendicular unit vector
      const py  =  dx / len;

      const jL = (seededRand(seed + i * 3)     - 0.5) * size * 0.4;
      const jR = (seededRand(seed + i * 3 + 1) - 0.5) * size * 0.4;

      left[i]  = { x: pts[i].x + px * (r + jL), y: pts[i].y + py * (r + jL) };
      right[i] = { x: pts[i].x - px * (r + jR), y: pts[i].y - py * (r + jR) };
    }

    // Filled polygon: left side forward, right side backward
    ctx2d.beginPath();
    ctx2d.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < pts.length; i++) ctx2d.lineTo(left[i].x, left[i].y);
    for (let i = pts.length - 1; i >= 0; i--) ctx2d.lineTo(right[i].x, right[i].y);
    ctx2d.closePath();
    ctx2d.fill();

    // Round end caps
    ctx2d.beginPath();
    ctx2d.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.beginPath();
    ctx2d.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, r, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.restore();
  }

  // ── Bake a completed stroke onto the offscreen canvas ────────────────────
  function bakeStroke(stroke) {
    const pts = stroke.points;
    if (pts.length < 1) return;
    drawChalkStroke(octx, pts, stroke.color, stroke.size, stroke.seed);
  }

  // ── Redraw the active stroke onto scratch ─────────────────────────────────
  // Clears and redraws from all stored points so semi-transparent layers
  // never accumulate and darken as the user draws slowly.
  function redrawScratch(points, seed) {
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    if (points.length < 1) return;

    // Convert page-space points to viewport space for the scratch canvas
    const sx = window.scrollX, sy = window.scrollY;
    const pts = points.map(p => ({ x: p.x - sx, y: p.y - sy }));
    drawChalkStroke(sctx, pts, color, brushSize, seed);
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

  function getPagePos(e) {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx + window.scrollX, y: cy + window.scrollY };
  }
  function getClientPos(e) {
    return {
      x: e.touches ? e.touches[0].clientX : e.clientX,
      y: e.touches ? e.touches[0].clientY : e.clientY,
    };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!drawing) return;
    isDown = true;
    resizeOffscreen();
    const page = getPagePos(e);
    lastX = getClientPos(e).x; lastY = getClientPos(e).y;
    activeStroke = { color, size: brushSize, seed: Math.floor(Math.random() * 1e9), points: [page] };
    redrawScratch(activeStroke.points, activeStroke.seed);
  });

  canvas.addEventListener('pointermove', e => {
    const client = getClientPos(e);
    cursor.style.left = client.x + 'px';
    cursor.style.top  = client.y + 'px';
    if (!drawing || !isDown || !activeStroke) return;
    if (Math.hypot(client.x - lastX, client.y - lastY) > 2) {
      activeStroke.points.push(getPagePos(e));
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
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

})();
