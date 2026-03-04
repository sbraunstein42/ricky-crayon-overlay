(function () {

  const canvas   = document.getElementById('crayon-canvas');
  const ctx      = canvas.getContext('2d');
  const cursor   = document.getElementById('crayon-cursor');
  const stopBtn  = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const rack     = document.getElementById('crayon-rack');
  const hint     = document.getElementById('hint');

  let drawing      = false;
  let isDown       = false;
  let lastX        = 0, lastY = 0;
  let color        = '#e63946';
  const brushSize  = 14;

  // ── Stroke storage ───────────────────────────────────────────────────────
  // Committed strokes: redrawn every frame from stored points (page-space).
  // Active stroke: drawn live and directly onto a scratch canvas — no jitter.
  let strokes      = [];   // completed strokes
  let activeStroke = null; // stroke currently being drawn

  // Scratch canvas: live drawing goes here, composited on top each frame
  const scratch  = document.createElement('canvas');
  const sctx     = scratch.getContext('2d');
  scratch.width  = window.innerWidth;
  scratch.height = window.innerHeight;

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

  // ── Canvas resize ────────────────────────────────────────────────────────
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    scratch.width  = window.innerWidth;
    scratch.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── Seeded PRNG (for stable texture on committed strokes) ─────────────────
  function makePRNG(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  // ── RAF redraw loop ───────────────────────────────────────────────────────
  // Redraws all COMMITTED strokes offset by scroll. The active stroke
  // is already live on the scratch canvas and just gets composited on top.
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = window.scrollX, sy = window.scrollY;

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      drawStoredStroke(stroke, sx, sy);
    }

    // composite the live scratch canvas on top
    ctx.drawImage(scratch, 0, 0);

    requestAnimationFrame(redraw);
  }
  requestAnimationFrame(redraw);

  // ── Draw a committed stroke (stable, seeded texture) ─────────────────────
  function drawStoredStroke(stroke, scrollX, scrollY) {
    const pts    = stroke.points;
    const size   = stroke.size;
    const jitter = size * 0.35;
    const rand   = makePRNG(stroke.seed);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = stroke.color;

    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x - scrollX + (rand()-.5)*jitter,
                 pts[0].y - scrollY + (rand()-.5)*jitter);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x - scrollX + (rand()-.5)*jitter,
                   pts[i].y - scrollY + (rand()-.5)*jitter);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = stroke.color;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i].x, y0 = pts[i].y;
      const x1 = pts[i+1].x, y1 = pts[i+1].y;
      const dist = Math.hypot(x1-x0, y1-y0);
      for (let g = 0; g < dist * 0.6; g++) {
        const t = rand();
        ctx.beginPath();
        ctx.arc(
          x0+(x1-x0)*t+(rand()-.5)*size*0.8 - scrollX,
          y0+(y1-y0)*t+(rand()-.5)*size*0.8 - scrollY,
          rand()*size*0.25, 0, Math.PI*2
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── Draw a live segment onto the scratch canvas (no jitter) ──────────────
  function drawLiveSegment(x0, y0, x1, y1) {
    const jitter = brushSize * 0.35;

    sctx.save();
    sctx.globalAlpha = 0.18;
    sctx.lineWidth   = brushSize;
    sctx.lineCap     = 'round';
    sctx.lineJoin    = 'round';
    sctx.strokeStyle = color;

    const dist  = Math.hypot(x1-x0, y1-y0);
    const steps = Math.max(1, Math.floor(dist/2));

    for (let layer = 0; layer < 4; layer++) {
      sctx.beginPath();
      sctx.moveTo(x0 + (Math.random()-.5)*jitter, y0 + (Math.random()-.5)*jitter);
      for (let s = 1; s <= steps; s++) {
        const t = s/steps;
        sctx.lineTo(
          x0+(x1-x0)*t + (Math.random()-.5)*jitter,
          y0+(y1-y0)*t + (Math.random()-.5)*jitter
        );
      }
      sctx.stroke();
    }

    sctx.globalAlpha = 0.08;
    sctx.fillStyle   = color;
    for (let g = 0; g < dist*0.6; g++) {
      const t = Math.random();
      sctx.beginPath();
      sctx.arc(
        x0+(x1-x0)*t+(Math.random()-.5)*brushSize*0.8,
        y0+(y1-y0)*t+(Math.random()-.5)*brushSize*0.8,
        Math.random()*brushSize*0.25, 0, Math.PI*2
      );
      sctx.fill();
    }
    sctx.restore();
  }

  // ── Build crayons from template in crayon-template.js ────────────────────
  CRAYONS.forEach(cr => buildCrayon(cr));

  function buildCrayon(cr) {
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
      el.style.background = cr.color;
      el.style.width  = '130px';
      el.style.height = '32px';
    }

    el.addEventListener('click', () => {
      color = cr.color;
      document.querySelectorAll('.crayon').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      startDrawing();
    });

    rack.appendChild(el);
  }

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
    drawing      = false;
    isDown       = false;
    activeStroke = null;
    canvas.style.pointerEvents = 'none';
    cursor.style.display       = 'none';
    document.body.style.cursor = '';
    rack.style.opacity         = '1';
    rack.style.pointerEvents   = 'auto';
    stopBtn.style.display      = 'none';
    clearBtn.style.display     = 'none';
    document.querySelectorAll('.crayon').forEach(c => c.classList.remove('active'));
  }

  stopBtn.addEventListener('click',  stopDrawing);
  clearBtn.addEventListener('click', () => {
    strokes      = [];
    activeStroke = null;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
  });
  setTimeout(() => hint.classList.add('hidden'), 5000);

  // ── Pointer events ────────────────────────────────────────────────────────
  function getPagePos(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX + window.scrollX, y: clientY + window.scrollY };
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
    const page   = getPagePos(e);
    const client = getClientPos(e);
    lastX = client.x; lastY = client.y;
    activeStroke = {
      color,
      size: brushSize,
      seed: Math.floor(Math.random() * 1e9),
      points: [page],
    };
    // NOTE: not pushed to strokes yet — only committed on pointerup
    // so the RAF loop doesn't redraw it while we're still drawing it
    // dot on tap
    drawLiveSegment(client.x, client.y, client.x+.1, client.y+.1);
  });

  canvas.addEventListener('pointermove', e => {
    const client = getClientPos(e);
    cursor.style.left = client.x + 'px';
    cursor.style.top  = client.y + 'px';

    if (!drawing || !isDown || !activeStroke) return;

    if (Math.hypot(client.x - lastX, client.y - lastY) > 2) {
      // store in page-space
      activeStroke.points.push(getPagePos(e));
      // draw live segment in client-space (no scroll offset needed on scratch)
      drawLiveSegment(lastX, lastY, client.x, client.y);
      lastX = client.x; lastY = client.y;
    }
  });

  canvas.addEventListener('pointerup', () => {
    isDown = false;
    if (activeStroke && activeStroke.points.length >= 2) {
      strokes.push(activeStroke); // commit now — RAF loop takes over
    }
    activeStroke = null;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
  });

  canvas.addEventListener('pointerleave', () => {
    isDown = false;
    if (activeStroke && activeStroke.points.length >= 2) {
      strokes.push(activeStroke);
    }
    activeStroke = null;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
  });

  window.addEventListener('mousemove', e => {
    if (drawing) return;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

})();
