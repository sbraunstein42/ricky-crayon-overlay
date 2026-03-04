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
  let color   = '#ef233c';
  const brushSize = 14;

  const CRAYONS = [
    { color: '#ef233c', name: 'Red'    },
    { color: '#ff6b35', name: 'Orange' },
    { color: '#ffd166', name: 'Yellow' },
    { color: '#06d6a0', name: 'Green'  },
    { color: '#118ab2', name: 'Blue'   },
    { color: '#7b2d8b', name: 'Purple' },
    { color: '#ffffff', name: 'White'  },
    { color: '#222222', name: 'Black'  },
  ];

  // ── Canvas resize ────────────────────────────────────────────────────────
  function resizeCanvas() {
    const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.putImageData(saved, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ── Build crayons ────────────────────────────────────────────────────────
  CRAYONS.forEach(cr => {
    const el = document.createElement('div');
    el.className = 'crayon';
    el.style.setProperty('--c', cr.color);
    el.title = cr.name;

    const shine = document.createElement('div');
    shine.className = 'crayon-shine';
    el.appendChild(shine);

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
  clearBtn.addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  setTimeout(() => hint.classList.add('hidden'), 5000);

  // ── Crayon stroke ────────────────────────────────────────────────────────
  function crayonStroke(x0, y0, x1, y1) {
    const dist   = Math.hypot(x1-x0, y1-y0);
    const steps  = Math.max(1, Math.floor(dist/2));
    const jitter = brushSize * 0.35;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = color;

    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      ctx.moveTo(x0+(Math.random()-.5)*jitter, y0+(Math.random()-.5)*jitter);
      for (let s = 1; s <= steps; s++) {
        const t = s/steps;
        ctx.lineTo(
          x0+(x1-x0)*t+(Math.random()-.5)*jitter,
          y0+(y1-y0)*t+(Math.random()-.5)*jitter
        );
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = color;
    for (let g = 0; g < dist*0.6; g++) {
      const t = Math.random();
      ctx.beginPath();
      ctx.arc(
        x0+(x1-x0)*t+(Math.random()-.5)*brushSize*0.8,
        y0+(y1-y0)*t+(Math.random()-.5)*brushSize*0.8,
        Math.random()*brushSize*0.25, 0, Math.PI*2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Pointer events ────────────────────────────────────────────────────────
  function getPos(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!drawing) return;
    isDown = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    crayonStroke(p.x, p.y, p.x+.1, p.y+.1);
  });

  canvas.addEventListener('pointermove', e => {
    const p = getPos(e);
    cursor.style.left = p.x + 'px';
    cursor.style.top  = p.y + 'px';
    if (!drawing || !isDown) return;
    crayonStroke(lastX, lastY, p.x, p.y);
    lastX = p.x; lastY = p.y;
  });

  canvas.addEventListener('pointerup',    () => { isDown = false; });
  canvas.addEventListener('pointerleave', () => { isDown = false; });

  window.addEventListener('mousemove', e => {
    if (drawing) return;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

})();
