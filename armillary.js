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
  // The time dial: days away from now, how fast they are still moving, and the hand on it.
  const dial = { days: 0, push: 0, holdUntil: 0, frame: null, previous: null, reset: null };
  // The hand on the instrument: spinning it, or turning the date by the ecliptic.
  let drag = null, push = 0, eclipticHot = false, eclipticPath = [];
  // Brief lights: a glint running round the ecliptic, and a flare on the moon bead.
  let pulse = null, flare = null;
  let signSpots = [], pointedSign = null, tappedSign = null, tapTimer = null;

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
  function bead(p, size, color, glow, light = '#fff6df') {
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
    body.addColorStop(0, light);
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
      signSpots[i] = { x: s.x, y: s.y, near, lit };
    });
  }

  // Each sign's name and the dates the Sun usually spends in it.
  const signNames = [
    ['Aries', '白羊宫', '3.21 – 4.19'], ['Taurus', '金牛宫', '4.20 – 5.20'], ['Gemini', '双子宫', '5.21 – 6.21'],
    ['Cancer', '巨蟹宫', '6.22 – 7.22'], ['Leo', '狮子宫', '7.23 – 8.22'], ['Virgo', '处女宫', '8.23 – 9.22'],
    ['Libra', '天秤宫', '9.23 – 10.22'], ['Scorpio', '天蝎宫', '10.23 – 11.21'], ['Sagittarius', '人马宫', '11.22 – 12.21'],
    ['Capricorn', '摩羯宫', '12.22 – 1.19'], ['Aquarius', '宝瓶宫', '1.20 – 2.18'], ['Pisces', '双鱼宫', '2.19 – 3.20']
  ];
  const signLabel = document.createElement('p');
  signLabel.className = 'sign-label';
  signLabel.setAttribute('aria-hidden', 'true');
  signLabel.hidden = true;
  host.append(signLabel);
  function placeSignLabel() {
    const i = pointedSign ?? tappedSign;
    const spot = i === null ? null : signSpots[i];
    signLabel.hidden = !spot;
    if (!spot) return;
    const [en, zh, dates] = signNames[i];
    const text = `${signs[i]} ${en.toUpperCase()} · ${zh}`;
    const note = spot.lit ? `${dates} · 太阳在此宫` : dates;
    if (signLabel.dataset.text !== text + note) {
      signLabel.dataset.text = text + note;
      signLabel.replaceChildren(text, Object.assign(document.createElement('span'), { textContent: note }));
    }
    signLabel.style.left = `${spot.x}px`;
    signLabel.style.top = `${spot.y}px`;
    signLabel.classList.toggle('is-lit', spot.lit);
  }
  function signAt(x, y) {
    let best = null, distance = 16;
    signSpots.forEach((spot, i) => {
      const d = Math.hypot(spot.x - x, spot.y - y) - (spot.near ? 3 : 0);
      if (d < distance) { distance = d; best = i; }
    });
    return best;
  }

  // A light that runs once round the ecliptic from the Sun, like the instrument chiming.
  function drawPulse(lst, sunLon, now) {
    if (!pulse) return;
    const t = (now - pulse) / 1900;
    if (t < 0) return;
    if (t >= 1) { pulse = null; return; }
    const head = sunLon + (1 - Math.pow(1 - t, 2.2)) * 360;
    const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 3);
    for (let k = 0; k < 28; k += 1) {
      const a = view(local(...eclipticToEquatorial(head - k * 2), lst));
      const b = view(local(...eclipticToEquatorial(head - k * 2 - 2.2), lst));
      const g = contexts[a.z < 0 ? 1 : 0];
      const strength = (1 - k / 28) * fade * (a.z < 0 ? 1 : .45);
      g.strokeStyle = '#ffe3ae';
      g.globalAlpha = strength * .25;
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.globalAlpha = strength;
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }
  // A bump that rises and settles over a moment, for flaring beads.
  const swell = (start, now, length) => {
    const t = start === null ? 1 : (now - start) / length;
    return t >= 0 && t < 1 ? Math.sin(t * Math.PI) : 0;
  };

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
    // The ecliptic is also the time dial; it brightens under the hand.
    const eclipticPoints = circle(ecliptic);
    eclipticPath = eclipticPoints.map(p => view(p));
    ring(eclipticPoints, eclipticHot || dial.days ? { ...slim, width: 2.6, alpha: 1, body: '#8a7148', shine: '#ffe2a8' } : { ...slim, shine: '#f3c98a' });
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

    const now = performance.now();
    drawPulse(lst, sunLon, now);
    if (flare !== null && now - flare > 1400) flare = null;

    // The Moon's silver bead keeps within about five degrees of the ecliptic;
    // its angle from the Sun's bead is the phase seen in the sky.
    const moon = sky.moon();
    const moonSize = Math.max(2.5, radius * .028) * (1 + swell(flare, now, 1400) * .7);
    bead(local(moon.ra, moon.dec, lst), moonSize, '#aab6cc', '#dce6ff88', '#ffffff');

    // The Sun's bead rides the ecliptic at its real longitude.
    const [sunRa, sunDec] = eclipticToEquatorial(sunLon);
    const sunSize = Math.max(3, radius * .035) * (1 + swell(pulse === null ? null : pulse + 1500, now, 900) * .6);
    bead(local(sunRa, sunDec, lst), sunSize, '#f2b45c', '#ffcf8a88');
    contexts.forEach(g => { g.globalAlpha = 1; });
    placeSignLabel();
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

  // Two hands on one instrument. Dragging it sideways spins it on its turntable, with a
  // little coasting. Dragging the ecliptic itself turns the date instead: once round the
  // ring is a year, always at this hour, so the sky changes with the seasons. A flick
  // coasts, and after a pause the sky returns to now.
  const caption = document.querySelector('.binary-caption .eyebrow');
  const captionText = caption?.textContent || '';
  const dateFormat = (() => {
    try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: sky.place.timeZone }); } catch { return null; }
  })();
  const daysPerPixel = () => 365.25 / (Math.PI * 2 * (radius || 100));
  function syncCaption() {
    if (!caption) return;
    const whole = Math.round(dial.days);
    caption.textContent = whole && dateFormat
      ? `${dateFormat.format(sky.now()).toUpperCase()} · ${whole > 0 ? '+' : '−'}${Math.abs(whole)} ${Math.abs(whole) === 1 ? 'DAY' : 'DAYS'}`
      : eclipticHot ? 'Drag the ecliptic to turn the date' : captionText;
  }
  function setDays(days) {
    dial.days = days;
    // Fractions of a day pass through too, so the sky glides rather than steps.
    sky.setDial(days * 86400000);
    syncCaption();
    host.classList.toggle('is-dialled', days !== 0);
  }
  function dialTick(time) {
    dial.frame = null;
    const step = dial.previous === null ? 16 : Math.min(time - dial.previous, 80);
    dial.previous = time;
    if (drag?.mode !== 'dial') {
      if (Math.abs(dial.push) > .00002) {
        setDays(dial.days + dial.push * step);
        dial.push *= Math.exp(-step / 700);
        dial.holdUntil = time + 2200;
      } else if (dial.days && time > dial.holdUntil) {
        // Glide home: quick at first, gentle at the end.
        // A small steady pull finishes the last few days instead of creeping.
        const eased = dial.days * Math.exp(-step / 420);
        const next = eased - Math.sign(eased) * Math.min(Math.abs(eased), step * .006);
        setDays(Math.abs(next) < .01 ? 0 : next);
      }
    }
    if (frame === null) draw();
    if (drag?.mode === 'dial' || dial.days || Math.abs(dial.push) > .00002) dial.frame = requestAnimationFrame(dialTick);
    else dial.previous = null;
  }
  function runDial() {
    if (dial.frame === null) dial.frame = requestAnimationFrame(dialTick);
  }

  // How far a point is from the ecliptic as drawn, in pixels.
  function nearEcliptic(x, y, reach) {
    for (let i = 1; i < eclipticPath.length; i += 1) {
      const a = eclipticPath[i - 1], b = eclipticPath[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) < reach) return true;
    }
    return false;
  }
  function setHot(hot) {
    if (hot === eclipticHot) return;
    eclipticHot = hot;
    host.classList.toggle('is-over-ecliptic', hot);
    syncCaption();
    if (frame === null) draw();
  }

  host.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const bounds = host.getBoundingClientRect();
    const onRing = !event.target.closest('button') && nearEcliptic(event.clientX - bounds.left, event.clientY - bounds.top, event.pointerType === 'mouse' ? 9 : 16);
    drag = { mode: onRing ? 'dial' : 'spin', id: event.pointerId, x: event.clientX, last: event.clientX, time: event.timeStamp, moved: false };
    if (onRing) { dial.push = 0; window.clearTimeout(dial.reset); setHot(true); } else push = 0;
  });
  host.addEventListener('pointermove', event => {
    const bounds = host.getBoundingClientRect();
    if (!drag || event.pointerId !== drag.id) {
      if (event.pointerType === 'mouse') {
        // Pointing at a sign names it; pointing at the ecliptic offers the dial.
        const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
        const sign = signAt(x, y);
        if (sign !== pointedSign) { pointedSign = sign; placeSignLabel(); }
        setHot(!event.target.closest('button') && nearEcliptic(x, y, 9));
      }
      return;
    }
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      try { host.setPointerCapture(event.pointerId); } catch { /* The pointer already left; the drag still works. */ }
      host.classList.add('is-turning');
      pointedSign = tappedSign = null;
    }
    const dx = event.clientX - drag.last;
    const elapsed = Math.max(8, event.timeStamp - drag.time);
    if (drag.mode === 'dial') {
      const days = dx * daysPerPixel();
      setDays(dial.days + days);
      dial.push = dial.push * .5 + days / elapsed * .5;
      runDial();
    } else {
      // Yaw turns the near side to the right, so the rings follow the hand.
      const turn = dx / (radius || 1);
      spin += turn;
      push = push * .5 + turn / elapsed * .5;
      if (frame === null) draw();
    }
    drag.last = event.clientX;
    drag.time = event.timeStamp;
  });
  host.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse' || drag) return;
    setHot(false);
    if (pointedSign !== null) { pointedSign = null; placeSignLabel(); }
  });
  const release = event => {
    const hand = drag;
    if (!hand || event.pointerId !== hand.id) return;
    drag = null;
    if (event.pointerType !== 'mouse') setHot(false);
    if (hand.moved) {
      host.classList.remove('is-turning');
      // A hand that stopped before letting go leaves things where they are.
      const resting = event.timeStamp - hand.time > 120;
      if (hand.mode === 'dial') {
        dial.push = resting || still() ? 0 : Math.max(-.5, Math.min(.5, dial.push));
        dial.holdUntil = performance.now() + 2200;
        // Without motion there is no coasting or gliding: the sky simply comes back.
        if (still()) dial.reset = window.setTimeout(() => setDays(0), 3500);
        else runDial();
      } else {
        push = resting || still() ? 0 : Math.max(-.006, Math.min(.006, push));
      }
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      return;
    }
    if (hand.mode === 'dial') runDial();
    // A tap on a sign names it for a few seconds.
    const bounds = host.getBoundingClientRect();
    const sign = signAt(event.clientX - bounds.left, event.clientY - bounds.top);
    if (sign !== null && event.pointerType !== 'mouse') {
      tappedSign = sign;
      placeSignLabel();
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => { tappedSign = null; placeSignLabel(); }, 3200);
    }
  };
  const swallow = event => { event.stopPropagation(); event.preventDefault(); };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);

  // After a story from the sky is read, the instrument chimes; touching the moon lights its bead.
  const story = document.querySelector('.lab-story');
  story?.addEventListener('close', () => {
    if (still() || !['meteor', 'atlas'].includes(story.dataset.kind)) return;
    pulse = performance.now() + 250;
  });
  document.addEventListener('lab:moon-touched', () => { if (!still()) flare = performance.now(); });

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
