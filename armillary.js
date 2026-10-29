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
  // A push from the visitor's hand, in radians per millisecond, fading back to the turntable.
  let push = 0, drag = null;

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
    return { x: width / 2 + x1 * radius * scale, y: height / 2 - y2 * radius * scale, z: z2, nx: x1, ny: y2 };
  }

  // A lamp above and to the left of the viewer. Each piece of brass shines by how
  // squarely it faces the halfway direction between lamp and eye, so as the
  // instrument turns or leans, the highlights slide along the rings like real metal.
  const lamp = (() => {
    const l = [-.5, .65, -.58], v = [0, 0, -1];
    const h = l.map((c, i) => c + v[i]);
    const n = Math.hypot(...h);
    return h.map(c => c / n);
  })();
  function glint(p) {
    const n = Math.hypot(p.nx, p.ny, p.z) || 1;
    const facing = Math.max(0, (p.nx * lamp[0] + p.ny * lamp[1] + p.z * lamp[2]) / n);
    return Math.pow(facing, 6) * .7 + Math.pow(facing, 40) * .9;
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
      // Where the ring faces the lamp, a brighter glint rides on top. Neighbouring
      // pieces of similar brightness share one stroke, so the glint stays smooth.
      g.lineCap = 'butt';
      g.strokeStyle = '#fff3d4';
      const steps = 16;
      let level = 0, piece = [];
      const stroke = (width, offset) => {
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(piece[0].x, piece[0].y + offset);
        piece.slice(1).forEach(p => g.lineTo(p.x, p.y + offset));
        g.stroke();
      };
      const shine = () => {
        if (!level || piece.length < 2) return;
        const strength = level / steps * (layer ? 1 : .35) * style.alpha;
        // A soft bloom around the glint, then the bright line itself.
        g.globalAlpha = strength * .22;
        stroke(style.width * 2.4, 0);
        g.globalAlpha = strength;
        stroke(Math.max(.8, style.width * (.3 + level / steps * .3)), -style.width * .2);
      };
      for (let i = 0; i < run.length; i += 1) {
        const next = Math.min(steps, Math.round(glint(run[i]) * steps));
        piece.push(run[i]);
        if (next !== level) { shine(); piece = [run[i]]; level = next; }
      }
      shine();
      g.lineCap = 'round';
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

  // The twelve signs, engraved just inside the ecliptic and divided by short ticks.
  const signs = ['\u2648', '\u2649', '\u264A', '\u264B', '\u264C', '\u264D', '\u264E', '\u264F', '\u2650', '\u2651', '\u2652', '\u2653']
    .map(glyph => `${glyph}\uFE0E`);
  function zodiac(lst, sunLon) {
    const current = Math.floor(((sunLon % 360) + 360) % 360 / 30);
    signs.forEach((glyph, i) => {
      const p = local(...eclipticToEquatorial(i * 30 + 15), lst);
      const s = view(p, .87);
      const near = s.z < 0;
      const g = contexts[near ? 1 : 0];
      const lit = i === current;
      g.globalAlpha = lit ? (near ? .95 : .5) : (near ? .5 : .14);
      g.fillStyle = lit ? '#ffd79a' : '#cdb88a';
      g.font = `${Math.max(9, radius * (lit ? .1 : .08))}px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(glyph, s.x, s.y);
    });
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
    const ecliptic = a => local(...eclipticToEquatorial(a), lst);
    const sunLon = sky.sunLongitude();
    ring(circle(ecliptic), { ...slim, shine: '#f3c98a' });
    ticks(ecliptic, 12, .965, 1.035, slim);
    zodiac(lst, sunLon);

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
    const [sunRa, sunDec] = eclipticToEquatorial(sunLon);
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
      if (!drag) {
        spin += push * step;
        push *= Math.exp(-step / 900);
      }
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

  // Drag sideways to spin the instrument; it coasts and settles back into its slow turn.
  // A short press stays a click, so the stars still open their notes.
  host.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, last: event.clientX, time: event.timeStamp, moved: false };
    push = 0;
  });
  host.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      try { host.setPointerCapture(event.pointerId); } catch { /* The pointer already left; the drag still works. */ }
      host.classList.add('is-turning');
    }
    // Yaw turns the near side to the right, so the rings follow the hand.
    const turn = (event.clientX - drag.last) / (radius || 1);
    const elapsed = Math.max(8, event.timeStamp - drag.time);
    spin += turn;
    push = push * .5 + turn / elapsed * .5;
    drag.last = event.clientX;
    drag.time = event.timeStamp;
    if (frame === null) draw();
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    // A hand that stopped before letting go leaves the instrument where it is.
    if (event.timeStamp - drag.time > 120) push = 0;
    push = Math.max(-.006, Math.min(.006, still() ? 0 : push));
    if (drag.moved) {
      host.classList.remove('is-turning');
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
    drag = null;
  };
  const swallow = event => { event.stopPropagation(); event.preventDefault(); };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);

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
