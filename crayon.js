(function () {

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
  let color       = '#e63946';
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
    { color: '#e63946', dark: '#9d0208', label: '#fff', name: 'Red'    },
    { color: '#fb5607', dark: '#c44b06', label: '#fff', name: 'Orange' },
    { color: '#ffbe0b', dark: '#c9960a', label: '#333', name: 'Yellow' },
    { color: '#06d6a0', dark: '#049a73', label: '#fff', name: 'Green'  },
    { color: '#118ab2', dark: '#0a6282', label: '#fff', name: 'Blue'   },
    { color: '#7b2d8b', dark: '#4a1a54', label: '#fff', name: 'Purple' },
    { color: '#cccccc', dark: '#999999', label: '#555', name: 'White'  },
    { color: '#333333', dark: '#111111', label: '#fff', name: 'Black'  },
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
    // Blit offscreen shifted by scroll — this is the entire cost of all past strokes
    ctx.drawImage(offscreen, -window.scrollX, -window.scrollY);
    // Blit the live scratch stroke on top
    ctx.drawImage(scratch, 0, 0);
    requestAnimationFrame(redraw);
  }
  requestAnimationFrame(redraw);

  // ── Bake a completed stroke onto the offscreen canvas ────────────────────
  // Same clean single-path approach as redrawScratch — no texture, no jitter.
  function bakeStroke(stroke) {
    const pts = stroke.points;
    if (pts.length < 2) return;

    octx.save();
    octx.globalAlpha = 0.7;
    octx.lineWidth   = stroke.size;
    octx.lineCap     = 'round';
    octx.lineJoin    = 'round';
    octx.strokeStyle = stroke.color;

    octx.beginPath();
    octx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i-1].x + pts[i].x) / 2;
      const my = (pts[i-1].y + pts[i].y) / 2;
      octx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
    }
    octx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    octx.stroke();
    octx.restore();
  }

  // ── Redraw the entire active stroke onto scratch from stored points ────────
  // We clear and redraw the whole thing every pointermove so semi-transparent
  // layers never accumulate and darken as the user draws slowly.
  function redrawScratch(points) {
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    if (points.length < 2) return;

    // Convert page-space points to viewport space for scratch canvas
    const sx = window.scrollX, sy = window.scrollY;
    const pts = points.map(p => ({ x: p.x - sx, y: p.y - sy }));

    sctx.save();
    sctx.globalAlpha = 0.7; // single pass, higher alpha to look like crayon
    sctx.lineWidth   = brushSize;
    sctx.lineCap     = 'round';
    sctx.lineJoin    = 'round';
    sctx.strokeStyle = color;

    // One smooth path through all points — no accumulation, no darkening
    sctx.beginPath();
    sctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      // Smooth curve through midpoints for a natural feel
      const mx = (pts[i-1].x + pts[i].x) / 2;
      const my = (pts[i-1].y + pts[i].y) / 2;
      sctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, my);
    }
    sctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    sctx.stroke();
    sctx.restore();
  }

  // ── Build crayon UI from template ────────────────────────────────────────
  CRAYONS.forEach(cr => {
    const el = document.createElement('div');
    el.className = 'crayon';
    el.title     = cr.name;

    const template = window.CRAYON_TEMPLATE;
    if (template) {
      const id = cr.name.toLowerCase();
      el.innerHTML = template
        .replaceAll('{{ID}}',    id)
        .replaceAll('{{COLOR}}', cr.color)
        .replaceAll('{{DARK}}',  cr.dark)
        .replaceAll('{{LABEL}}', cr.label)
        .replaceAll('{{NAME}}',  cr.name);
    } else {
      el.style.cssText = `background:${cr.color};width:130px;height:32px;`;
    }

    el.addEventListener('click', () => {
      color = cr.color;
      document.querySelectorAll('.crayon').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      startDrawing();
    });

    rack.appendChild(el);
  });

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
    activeStroke = { color, size: brushSize, seed: Math.floor(Math.random()*1e9), points: [page] };
    redrawScratch(activeStroke.points);
  });

  canvas.addEventListener('pointermove', e => {
    const client = getClientPos(e);
    cursor.style.left = client.x + 'px';
    cursor.style.top  = client.y + 'px';
    if (!drawing || !isDown || !activeStroke) return;
    if (Math.hypot(client.x-lastX, client.y-lastY) > 2) {
      activeStroke.points.push(getPagePos(e));
      redrawScratch(activeStroke.points);
      lastX = client.x; lastY = client.y;
    }
  });

  function commitStroke() {
    isDown = false;
    if (activeStroke && activeStroke.points.length >= 2) {
      bakeStroke(activeStroke); // write once to offscreen
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
