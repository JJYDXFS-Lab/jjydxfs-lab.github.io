(() => {
  'use strict';

  // Each card's line art doubles as a small 3D miniature. The drawing is sampled
  // from the card's own SVG, so seen head-on it matches the flat art exactly; when a
  // card is lit it turns to show its depth, then settles back to the flat art.
  const cards = [...document.querySelectorAll('.library-entry[data-project]')];
  const toggle = document.getElementById('motion-toggle');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!cards.length || typeof SVGGeometryElement === 'undefined') return;

  const rad = Math.PI / 180;
  const cx = 160, cy = 70; // centre of the 320 × 140 art

  // Depth for a point of element `i`, in the art's own units (positive is nearer).
  const orbit = (x, y) => (y - cy) * 2.3;
  const depth = {
    // An open book whose pages fold away from the spine, with its chart lifted off the page.
    library: (x, y, i) => i === 5 ? orbit(x, y) : -Math.abs(x - cx) * .55 + ((i === 1 && x > 166) || (i >= 2 && i <= 4) ? 18 : 0),
    // A citation network: each branch leans a different way from the central paper.
    literature: (x, y, i) => i === 8 ? orbit(x, y) : ((y - cy) / 35) * (x < 141 ? 30 : -26) * Math.min(1, Math.abs(x - 141) / 72),
    // Two crossing orbits around a centre, like an atom.
    'personal-agent': (x, y, i) => i === 0 ? (y - cy) * 2 : i === 1 || i === 3 || i === 4 ? -(y - cy) * 2 : 0,
    // A concept map that rises and falls like terrain.
    atlas: (x, y, i) => i === 8 ? orbit(x, y) : 24 * Math.sin((x - 57) * .045) + 16 * Math.cos((y - 27) * .06),
    // Two pages standing apart, their inner edges toward the viewer.
    skills: (x, y, i) => i === 0 ? (x < cx ? (x - 107) * .55 : -(x - 212) * .55) : 0
  };

  // Networks are drawn with straight edges; they stay straight in 3D when depth is
  // taken at the corners and interpolated along each edge.
  const straight = new Set(['literature', 'atlas']);
  function corners(line) {
    const marks = [0];
    for (let i = 1; i < line.length - 1; i += 1) {
      const a = Math.atan2(line[i].y - line[i - 1].y, line[i].x - line[i - 1].x);
      const b = Math.atan2(line[i + 1].y - line[i].y, line[i + 1].x - line[i].x);
      const turn = Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (turn > .35) marks.push(i);
    }
    marks.push(line.length - 1);
    return marks;
  }

  // Sample every drawn shape into polylines in the art's coordinate space.
  function sample(svg) {
    const shapes = [...svg.querySelectorAll('path, circle, ellipse')].filter(el => !el.closest('.project-constellation'));
    return shapes.map((el, index) => {
      const length = el.getTotalLength();
      const matrix = el.transform?.baseVal?.consolidate()?.matrix;
      const flat = el.tagName !== 'path' && !el.classList.contains('art-orbit');
      const centre = flat ? { x: +el.getAttribute('cx'), y: +el.getAttribute('cy') } : null;
      const lines = [];
      let line = [];
      const steps = Math.max(8, Math.ceil(length / 2));
      for (let s = 0; s <= steps; s += 1) {
        let p = el.getPointAtLength(length * s / steps);
        if (matrix) p = p.matrixTransform(matrix);
        const last = line[line.length - 1];
        // A jump means the path lifted its pen (a new subpath).
        if (last && Math.hypot(p.x - last.x, p.y - last.y) > 5) { if (line.length > 1) lines.push(line); line = []; }
        line.push({ x: p.x, y: p.y });
      }
      if (line.length > 1) lines.push(line);
      return { index, lines, centre, dashed: el.classList.contains('art-orbit') };
    });
  }

  const minis = cards.map(card => {
    const art = card.querySelector('.project-art');
    const svg = art?.querySelector('svg');
    const shape = depth[card.dataset.project];
    if (!art || !svg || !shape) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'miniature';
    canvas.setAttribute('aria-hidden', 'true');
    art.append(canvas);
    const parts = sample(svg).map(part => ({
      ...part,
      lines: part.lines.map(line => {
        if (part.centre || part.dashed || !straight.has(card.dataset.project)) {
          return line.map(p => {
            const at = part.centre || p;
            return { x: p.x, y: p.y, z: shape(at.x, at.y, part.index) };
          });
        }
        const marks = corners(line);
        return line.map((p, i) => {
          let k = 0;
          while (marks[k + 1] < i) k += 1;
          const a = marks[k], b = marks[k + 1];
          const t = b === a ? 0 : (i - a) / (b - a);
          const za = shape(line[a].x, line[a].y, part.index), zb = shape(line[b].x, line[b].y, part.index);
          return { x: p.x, y: p.y, z: za + (zb - za) * t };
        });
      })
    }));
    return { card, art, canvas, context: canvas.getContext('2d'), parts, turn: 0, target: 0, sway: 0, width: 0, height: 0 };
  }).filter(Boolean);
  if (!minis.length) return;
  document.documentElement.classList.add('has-miniatures');

  function resize(mini) {
    const bounds = mini.art.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    mini.width = bounds.width;
    mini.height = bounds.height;
    mini.canvas.width = Math.round(bounds.width * ratio);
    mini.canvas.height = Math.round(bounds.height * ratio);
    mini.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(mini) {
    const g = mini.context;
    g.clearRect(0, 0, mini.width, mini.height);
    // Match the SVG's own fit: 320 × 140 scaled to fit and centred in its box.
    const scale = Math.min(mini.width / 320, mini.height / 140);
    const ox = (mini.width - 320 * scale) / 2, oy = (mini.height - 140 * scale) / 2;
    const amount = mini.turn; // 0 flat, 1 fully turned
    const yaw = (30 * amount + mini.sway * 5 * amount) * rad;
    const pitch = 14 * amount * rad;
    const hue = getComputedStyle(mini.card).getPropertyValue('--hue').trim() || '#cbb78a';
    const project = p => {
      const x1 = (p.x - cx) * Math.cos(yaw) + p.z * Math.sin(yaw);
      const z1 = -(p.x - cx) * Math.sin(yaw) + p.z * Math.cos(yaw);
      const y2 = (p.y - cy) * Math.cos(pitch) - z1 * Math.sin(pitch);
      return { x: ox + (cx + x1) * scale, y: oy + (cy + y2) * scale, z: z1 };
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = hue;
    g.shadowColor = hue;
    g.shadowBlur = 6;
    for (const part of mini.parts) {
      g.setLineDash(part.dashed ? [3 * scale, 6 * scale] : []);
      g.lineWidth = scale;
      for (const line of part.lines) {
        // Far parts dim a little once the miniature turns, which sells the depth.
        const points = line.map(project);
        const z = points.reduce((sum, p) => sum + p.z, 0) / points.length;
        g.globalAlpha = (part.dashed ? .3 : 1) * (1 - amount * Math.max(0, Math.min(.5, -z / 90)));
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
  }

  const still = () => reduced.matches || toggle?.getAttribute('aria-pressed') === 'true';
  let frame = null, previous = null, clock = 0;
  function tick(time) {
    frame = null;
    const step = previous === null ? 16 : Math.min(time - previous, 80);
    previous = time;
    clock += step / 1000;
    let busy = false;
    for (const mini of minis) {
      const goal = mini.target;
      mini.turn += (goal - mini.turn) * (1 - Math.exp(-step / 380));
      if (Math.abs(goal - mini.turn) < .002) mini.turn = goal;
      mini.sway = Math.sin(clock * .9);
      const active = mini.turn > 0;
      // Swap to the canvas the moment it starts turning, and back once flat again.
      mini.art.classList.toggle('is-3d', active);
      if (active) { draw(mini); busy = true; }
    }
    if (busy || minis.some(mini => mini.target > 0)) frame = requestAnimationFrame(tick);
    else previous = null;
  }
  function sync() {
    for (const mini of minis) mini.target = !still() && mini.card.classList.contains('is-illuminated') ? 1 : 0;
    if (still()) for (const mini of minis) { mini.turn = 0; mini.art.classList.remove('is-3d'); }
    if (frame === null && minis.some(mini => mini.target > 0 || mini.turn > 0)) frame = requestAnimationFrame(tick);
  }

  // projects.js owns the lighting; follow its class rather than duplicating input handling.
  for (const mini of minis) new MutationObserver(sync).observe(mini.card, { attributes: true, attributeFilter: ['class'] });
  const observer = new ResizeObserver(entries => entries.forEach(entry => {
    const mini = minis.find(m => m.art === entry.target);
    if (mini) { resize(mini); if (mini.turn > 0) draw(mini); }
  }));
  minis.forEach(mini => { resize(mini); observer.observe(mini.art); });
  reduced.addEventListener('change', sync);
  if (toggle) new MutationObserver(sync).observe(toggle, { attributes: true, attributeFilter: ['aria-pressed'] });
})();
