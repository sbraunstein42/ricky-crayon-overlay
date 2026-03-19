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

  // ── Core crayon rendering — solid base + scattered grain dots ────────────
  //
  // Real crayon wax on paper looks like a mostly-solid stroke with:
  //   - slightly fuzzy/uneven edges
  //   - paper texture showing through as tiny gaps (grain)
  //
  // We achieve this with three layers:
  //   1. A solid smooth path at ~0.68 opacity (the main wax body)
  //   2. A second path drawn over the same route but with each point jittered
  //      slightly perpendicular to the travel direction — at wider lineWidth and
  //      lower opacity, this roughens the edges without any extra draw calls per
  //      point (still a single O(n) path, very cheap)
  //   3. Tiny dots within the stroke width at very low opacity (grain/texture)
  //
  // The seed makes all randomness deterministic so scratch redraws are stable.
  //
  function drawCrayonStroke(ctx2d, pts, strokeColor, size, seed) {
    if (pts.length < 1) return;

    // 1. Main solid stroke — the wax body
    if (pts.length >= 2) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.68;
      ctx2d.lineWidth   = size;
      ctx2d.lineCap     = 'round';
      ctx2d.lineJoin    = 'round';
      ctx2d.strokeStyle = strokeColor;
      ctx2d.beginPath();
      ctx2d.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i-1].x + pts[i].x) / 2;
        const my = (pts[i-1].y + pts[i].y) / 2;
        ctx2d.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
      }
      ctx2d.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
      ctx2d.stroke();
      ctx2d.restore();
    }

    // 2. Jagged-edge pass — same path but each point nudged perpendicular to
    //    travel direction by a seeded random amount. Drawn wider + semi-transparent
    //    so it bleeds outside the main stroke and breaks up the clean edge.
    if (pts.length >= 2) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.30;
      ctx2d.lineWidth   = size * 1.22;
      ctx2d.lineCap     = 'round';
      ctx2d.lineJoin    = 'round';
      ctx2d.strokeStyle = strokeColor;
      ctx2d.beginPath();
      ctx2d.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const dx  = pts[i].x - pts[i-1].x;
        const dy  = pts[i].y - pts[i-1].y;
        const len = Math.hypot(dx, dy) || 1;
        // Perpendicular unit vector
        const px  = -dy / len;
        const py  =  dx / len;
        const jitter = (seededRand(seed + i * 2 + 77) - 0.5) * size * 0.45;
        ctx2d.lineTo(pts[i].x + px * jitter, pts[i].y + py * jitter);
      }
      ctx2d.stroke();
      ctx2d.restore();
    }

    // 3. Grain — tiny dots scattered within the stroke area
    // 6 grains per sampled point, placed randomly within a circle of radius ≈ brushSize/2
    const GRAINS = 1;
    const grainR = 1.3;
    ctx2d.save();
    ctx2d.fillStyle = strokeColor;
    for (let i = 0; i < pts.length; i++) {
      for (let g = 0; g < GRAINS; g++) {
        const base  = seed + (i * GRAINS + g) * 3;
        const angle = seededRand(base)     * Math.PI * 2;
        const dist  = seededRand(base + 1) * (size / 2) * 0.95;
        const alpha = seededRand(base + 2) * 0.09 + 0.04; // 0.04–0.13
        ctx2d.globalAlpha = alpha;
        ctx2d.beginPath();
        ctx2d.arc(
          pts[i].x + Math.cos(angle) * dist,
          pts[i].y + Math.sin(angle) * dist,
          grainR, 0, Math.PI * 2
        );
        ctx2d.fill();
      }
    }
    ctx2d.restore();
  }

  // ── Bake a completed stroke onto the offscreen canvas ────────────────────
  function bakeStroke(stroke) {
    const pts = stroke.points;
    if (pts.length < 1) return;
    drawCrayonStroke(octx, pts, stroke.color, stroke.size, stroke.seed);
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
