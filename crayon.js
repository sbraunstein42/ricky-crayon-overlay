(function () {

  const canvas   = document.getElementById('crayon-canvas');
  const ctx      = canvas.getContext('2d');
  const cursor   = document.getElementById('crayon-cursor');
  const stopBtn  = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const rack     = document.getElementById('crayon-rack');
  const hint     = document.getElementById('hint');

  let drawing = false;
  let isDown  = false;
  let lastX   = 0, lastY = 0;
  let color   = '#e63946';
  const brushSize = 14;

  // ── Stroke storage ───────────────────────────────────────────────────────
  // Each stroke is { color, size, points: [{x, y}] }
  // Points are stored in PAGE space (i.e. scrollY already added in),
  // so they stay anchored to the content as the user scrolls.
  let strokes     = [];
  let activeStroke = null;

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
    // no need to preserve imageData — the RAF loop redraws everything
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── Redraw loop ──────────────────────────────────────────────────────────
  // Runs every frame. Clears the canvas and redraws all stored strokes
  // offset by the current scroll position, so marks appear glued to the page.
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      drawStoredStroke(stroke, scrollX, scrollY);
    }

    requestAnimationFrame(redraw);
  }
  requestAnimationFrame(redraw);

  // ── Render a stored stroke offset by scroll ──────────────────────────────
  function drawStoredStroke(stroke, scrollX, scrollY) {
    const pts    = stroke.points;
    const size   = stroke.size;
    const jitter = size * 0.35;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = stroke.color;

    // Seed random per-stroke so texture is stable across redraws
    let seed = stroke.seed;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      const p0 = pts[0];
      ctx.moveTo(p0.x - scrollX + (rand()-.5)*jitter,
                 p0.y - scrollY + (rand()-.5)*jitter);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x - scrollX + (rand()-.5)*jitter,
                   pts[i].y - scrollY + (rand()-.5)*jitter);
      }
      ctx.stroke();
    }

    // grain dots
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = stroke.color;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i].x,   y0 = pts[i].y;
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

  // ── Load SVG template then build crayons ─────────────────────────────────
  fetch('crayon-template.svg')
    .then(r => r.text())
    .then(template => CRAYONS.forEach(cr => buildCrayon(cr, template)))
    .catch(()      => CRAYONS.forEach(cr => buildCrayon(cr, null)));

  function buildCrayon(cr, template) {
    const el = document.createElement('div');
    el.className = 'crayon';
    el.title     = cr.name;

    if (template) {
      el.innerHTML = template
        .replaceAll('{{COLOR}}', cr.color)
        .replaceAll('{{DARK}}',  cr.dark)
        .replaceAll('{{LABEL}}', cr.label)
        .replaceAll('{{NAME}}',  cr.name);
    } else {
      el.style.background = cr.color;
      el.style.width = '130px';
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
    drawing = false;
    isDown  = false;
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
  clearBtn.addEventListener('click', () => { strokes = []; activeStroke = null; });
  setTimeout(() => hint.classList.add('hidden'), 5000);

  // ── Pointer events ────────────────────────────────────────────────────────
  // Coordinates are converted to page-space by adding scrollY/scrollX
  function getPos(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX + window.scrollX,
      y: clientY + window.scrollY,
    };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!drawing) return;
    isDown = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    // start a new stroke
    activeStroke = { color, size: brushSize, seed: Math.floor(Math.random() * 1e9), points: [p] };
    strokes.push(activeStroke);
  });

  canvas.addEventListener('pointermove', e => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    cursor.style.left = clientX + 'px';
    cursor.style.top  = clientY + 'px';

    if (!drawing || !isDown || !activeStroke) return;
    const p = getPos(e);
    // only add a point if we've moved enough (reduces point count)
    if (Math.hypot(p.x - lastX, p.y - lastY) > 2) {
      activeStroke.points.push(p);
      lastX = p.x; lastY = p.y;
    }
  });

  canvas.addEventListener('pointerup',    () => { isDown = false; activeStroke = null; });
  canvas.addEventListener('pointerleave', () => { isDown = false; activeStroke = null; });

  window.addEventListener('mousemove', e => {
    if (drawing) return;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

})();
