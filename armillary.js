(() => {
  'use strict';

  // A brass armillary sphere around the binary stars. Its celestial rings sit at the
  // lab's real latitude and sidereal time; the instrument turns slowly on a turntable.
  // Two canvases give it depth: rings behind the stars, and rings in front of them.
  const sky = window.LAB_SKY;
  const host = document.querySelector('.binary-sky');
  const back = host?.querySelector('.armillary-back');
  const front = host?.querySelector('.armillary-front');
  if (!sky || !host || !back || !front) return;
  const contexts = [back.getContext('2d'), front.getContext('2d')];
  if (!contexts[0] || !contexts[1]) return;

  const rad = Math.PI / 180;
  const tilt = 23.44 * rad;
  const lat = sky.place.lat * rad;
  // Look toward the celestial equator, as the sky does: north from the south, south from the north.
  const facing = sky.place.lat < 0 ? 1 : -1;
  const toggle = document.getElementById('motion-toggle');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let width = 0, height = 0, radius = 0;
  let spin = 0, previous = null, frame = null, inView = true;
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };

  // Celestial direction (RA, Dec in degrees) to local east / north / up.
  function local(ra, dec, lst) {
    const h = (lst - ra) * rad, d = dec * rad;
    return [
      -Math.cos(d) * Math.sin(h),
      Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.cos(h) * Math.sin(lat),
      Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(h) * Math.cos(lat)
    ];
  }
  function eclipticToEquatorial(lon) {
    const l = lon * rad;
    return [Math.atan2(Math.sin(l) * Math.cos(tilt), Math.cos(l)) / rad, Math.asin(Math.sin(tilt) * Math.sin(l)) / rad];
  }

  // Local vector to screen, with depth (negative is nearer the viewer).
  function view([east, north, up], scale = 1) {
    const x = east * facing, z = north * facing;
    const yaw = spin + lean.x, pitch = 16 * rad + lean.y;
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = up * Math.cos(pitch) + z1 * Math.sin(pitch);
    const z2 = z1 * Math.cos(pitch) - up * Math.sin(pitch);
    return { x: width / 2 + x1 * radius * scale, y: height / 2 - y2 * radius * scale, z: z2 };
  }

  function ring(points, style) {
    const projected = points.map(p => view(p, style.scale));
    // Split the ring into runs that stay on one side (behind or in front of the stars),
    // and draw each run as one smooth band of brass.
    let run = [projected[0]];
    let layer = projected[0].z < 0 ? 1 : 0;
    const flush = () => {
      if (run.length < 2) return;
      const g = contexts[layer];
      const depth = run.reduce((sum, p) => sum + p.z, 0) / run.length;
      const nearness = (1 - depth) / 2;
      const path = offset => {
        g.beginPath();
        g.moveTo(run[0].x, run[0].y + offset);
        for (let i = 1; i < run.length; i += 1) g.lineTo(run[i].x, run[i].y + offset);
        g.stroke();
      };
      g.globalAlpha = (layer ? .78 : .3) * style.alpha;
      g.strokeStyle = style.body;
      g.lineWidth = style.width * (.75 + nearness * .5);
      path(0);
      // A thin highlight along the band's upper edge reads as polished metal.
      g.globalAlpha = (layer ? .85 : .25) * style.alpha;
      g.strokeStyle = style.shine;
      g.lineWidth = Math.max(.6, style.width * .3);
      path(-style.width * .25);
    };
    for (let i = 1; i < projected.length; i += 1) {
      const next = projected[i].z < 0 ? 1 : 0;
      run.push(projected[i]);
      if (next !== layer) {
        flush();
        run = [projected[i]];
        layer = next;
      }
    }
    flush();
  }
  function circle(make, steps = 96) {
    return Array.from({ length: steps + 1 }, (_, i) => make(i / steps * 360));
  }
  function ticks(make, count, inner, outer, style) {
    for (let i = 0; i < count; i += 1) {
      const p = make(i / count * 360);
      const a = view(p, inner), b = view(p, outer);
      const g = contexts[a.z < 0 ? 1 : 0];
      g.globalAlpha = (a.z < 0 ? .8 : .25) * style.alpha;
      g.strokeStyle = style.shine;
      g.lineWidth = i % (count / 4) === 0 ? 1.3 : .8;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }
  function bead(p, size, color, glow) {
    const s = view(p);
    const g = contexts[s.z < 0 ? 1 : 0];
    const r = size * (s.z < 0 ? 1 : .8);
    const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
    halo.addColorStop(0, glow);
    halo.addColorStop(1, 'transparent');
    g.globalAlpha = s.z < 0 ? .7 : .35;
    g.fillStyle = halo;
    g.fillRect(s.x - r * 4, s.y - r * 4, r * 8, r * 8);
    const body = g.createRadialGradient(s.x - r * .35, s.y - r * .35, r * .1, s.x, s.y, r);
    body.addColorStop(0, '#fff6df');
    body.addColorStop(1, color);
    g.globalAlpha = s.z < 0 ? 1 : .5;
    g.fillStyle = body;
    g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill();
  }
  function letter(p, text) {
    const s = view(p, 1.17);
    const g = contexts[s.z < 0 ? 1 : 0];
    g.globalAlpha = s.z < 0 ? .7 : .25;
    g.fillStyle = '#d8c79f';
    g.font = `${Math.max(8, radius * .07)}px "SFMono-Regular", Consolas, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, s.x, s.y);
  }

  const brass = { body: '#7a6443', shine: '#f0d9a2', width: 3.2, alpha: 1, scale: 1 };
  const fixed = { body: '#6a5a40', shine: '#d9c08a', width: 4.2, alpha: .95, scale: 1.1 };
  const slim = { body: '#6f5d42', shine: '#e8cf98', width: 1.8, alpha: .8, scale: 1 };

  function draw() {
    contexts.forEach(g => g.clearRect(0, 0, width, height));
    if (!radius) return;
    const lst = sky.sidereal();

    // Fixed to the observer: the horizon and the meridian.
    ring(circle(a => [Math.sin(a * rad), Math.cos(a * rad), 0]), fixed);
    ring(circle(a => [0, Math.cos(a * rad), Math.sin(a * rad)]), fixed);
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => letter([Math.sin(a * rad), Math.cos(a * rad), 0], t));

    // The celestial cage, turned to this moment's sidereal time.
    const equator = a => local(a, 0, lst);
    ring(circle(equator), brass);
    ticks(equator, 24, 1, 1.045, brass);
    ring(circle(a => local(...eclipticToEquatorial(a), lst)), { ...slim, shine: '#f3c98a' });

    // The polar axis runs through the whole instrument.
    const north = local(0, 90, lst), south = local(0, -90, lst);
    const a = view(north, 1.16), b = view(south, 1.16);
    contexts.forEach((g, layer) => {
      g.globalAlpha = layer ? .55 : .3;
      g.strokeStyle = '#d9c08a';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    });
    bead(north.map(v => v * 1.16), Math.max(2, radius * .02), '#b89a62', '#e8cf9866');
    bead(south.map(v => v * 1.16), Math.max(2, radius * .02), '#b89a62', '#e8cf9866');

    // The Sun's bead rides the ecliptic at its real longitude.
    const [sunRa, sunDec] = eclipticToEquatorial(sky.sunLongitude());
    bead(local(sunRa, sunDec, lst), Math.max(3, radius * .035), '#f2b45c', '#ffcf8a88');
    contexts.forEach(g => { g.globalAlpha = 1; });
  }

  function resize() {
    const bounds = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    radius = Math.min(width, height) * .4;
    for (const [canvas, g] of [[back, contexts[0]], [front, contexts[1]]]) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.lineCap = 'round';
    }
    draw();
  }

  const still = () => reduced.matches || toggle?.getAttribute('aria-pressed') === 'true';
  function tick(time) {
    frame = null;
    if (still() || document.hidden || !inView) { previous = null; return; }
    if (previous !== null) {
      const step = Math.min(time - previous, 80);
      spin += step * Math.PI * 2 / 180000; // one turn every three minutes
      lean.x += (lean.tx - lean.x) * (1 - Math.exp(-step / 500));
      lean.y += (lean.ty - lean.y) * (1 - Math.exp(-step / 500));
    }
    previous = time;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (frame === null && !still() && !document.hidden && inView) frame = requestAnimationFrame(tick);
    if (still()) { lean.tx = lean.ty = 0; draw(); }
  }

  // Leaning toward the pointer, as if picking the instrument up to look at it.
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !fine.matches) return;
    const bounds = host.getBoundingClientRect();
    lean.tx = Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / 500)) * 14 * rad;
    lean.ty = Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / 500)) * 8 * rad;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { lean.tx = lean.ty = 0; });

  new ResizeObserver(resize).observe(host);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); sync(); }).observe(host);
  }
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  if (toggle) new MutationObserver(sync).observe(toggle, { attributes: true, attributeFilter: ['aria-pressed'] });
  // When still, the cage still follows the real sky once a minute.
  setInterval(() => { if (still()) draw(); }, 60000);
  sync();
})();
