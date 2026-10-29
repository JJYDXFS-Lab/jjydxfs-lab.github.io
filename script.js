(() => {
  "use strict";

  // The sky above one fixed place (set in sky-place.js), at the visitor's current moment.
  const SKY_PLACE = window.LAB_SKY_PLACE || { name: "Greenwich", lat: 51.4769, lon: -0.0005, timeZone: "Europe/London" };
  // Preview another moment with ?sky-time=2026-10-30T02:00:00+11:00; the sky then runs on from there.
  const skyOffset = (() => {
    const requested = Date.parse(new URLSearchParams(location.search).get("sky-time") || "");
    return Number.isFinite(requested) ? requested - Date.now() : 0;
  })();
  const skyNow = () => new Date(Date.now() + skyOffset);
  // A small read-only clock for other pieces of the sky, such as the armillary sphere.
  window.LAB_SKY = Object.freeze({
    place: SKY_PLACE,
    now: skyNow,
    sidereal: () => siderealDegrees(skyNow()),
    sunLongitude: () => sunEquatorial(skyNow()).lon
  });

  const canvas = document.getElementById("starfield");
  const button = document.getElementById("motion-toggle");
  const label = document.getElementById("motion-label");
  const skyLabel = document.getElementById("sky-place");
  const zenithLabel = document.getElementById("sky-zenith");
  const data = window.LAB_SKY_DATA;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointerPreference = window.matchMedia("(min-width: 801px) and (hover: hover) and (pointer: fine)");
  const fpsCap = 30;
  const dprCap = 1.5;
  const frameInterval = 1000 / fpsCap;
  const parallaxLimit = 18;
  const rad = Math.PI / 180;
  let context = null;
  let stars = [];
  let lines = [];
  let names = new Map();
  let dust = [];
  let width = 0;
  let height = 0;
  let frameCount = 0;
  let running = false;
  let reducedMotion = motionPreference.matches;
  let visible = !document.hidden;
  let inViewport = false;
  let userPaused = false;
  let pointerEnabled = false;
  let requestId = null;
  let previousTime = null;
  let animationTime = 0;
  let meteor = null;
  let burst = null;
  let nextMeteorAt = 5 + Math.random() * 4;
  let milkyWay = null;
  let milkyWayAt = -Infinity;
  let sun = { alt: -30, x: 0 };
  let moon = null;
  let moonShine = 0;
  let moonPinnedUntil = -Infinity;
  const pointer = { x: 0, y: 0, active: false };
  const parallax = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const glow = new Map();

  Object.defineProperty(window, "__labStarfieldState", {
    configurable: false,
    enumerable: false,
    get: () => Object.freeze({
      frameCount,
      running,
      particleCount: stars.length,
      reducedMotion,
      visible,
      inViewport,
      pointerEnabled,
      constellationStars: [...glow.values()].filter(value => value > .05).length,
      meteorActive: meteor !== null,
      sunAltitude: sun.alt,
      moon: moon && Object.freeze({ altitude: moon.alt, azimuth: moon.az, illumination: moon.lit, phase: moon.phase.en, limb: moon.limb, x: moon.x, y: moon.y }),
      parallax: Object.freeze({ x: parallax.x, y: parallax.y }),
      fpsCap,
      dprCap
    })
  });

  if (!canvas || !data) return;
  try {
    context = canvas.getContext("2d", { alpha: true });
  } catch {
    return;
  }
  if (!context) return;

  // --- Astronomy: low-precision formulas, plenty for a background sky. ---
  function siderealDegrees(date) {
    const days = date.getTime() / 86400000 - 10957.5;
    return ((280.46061837 + 360.98564736629 * days + SKY_PLACE.lon) % 360 + 360) % 360;
  }
  function horizontal(ra, dec, lst) {
    const hourAngle = (lst - ra) * rad;
    const lat = SKY_PLACE.lat * rad;
    const d = dec * rad;
    const alt = Math.asin(Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(lat) * Math.cos(hourAngle));
    const az = Math.atan2(-Math.sin(hourAngle) * Math.cos(d), Math.sin(d) * Math.cos(lat) - Math.cos(d) * Math.cos(hourAngle) * Math.sin(lat));
    return { alt: alt / rad, az: (az / rad + 360) % 360 };
  }
  function sunEquatorial(date) {
    const days = date.getTime() / 86400000 - 10957.5;
    const g = (357.529 + .98560028 * days) * rad;
    const longitude = (280.459 + .98564736 * days + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * rad;
    const tilt = (23.439 - .00000036 * days) * rad;
    return { lon: longitude / rad, ra: Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude)) / rad, dec: Math.asin(Math.sin(tilt) * Math.sin(longitude)) / rad };
  }
  // The Moon from the largest terms of its orbit; good to about half a degree.
  function moonEquatorial(date) {
    const days = date.getTime() / 86400000 - 10957.5;
    const L = 218.316 + 13.176396 * days;
    const M = (134.963 + 13.064993 * days) * rad;
    const F = (93.272 + 13.22935 * days) * rad;
    const D = (297.85 + 12.190749 * days) * rad;
    const sunAnomaly = (357.529 + .98560028 * days) * rad;
    const lon = (L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + .658 * Math.sin(2 * D) + .214 * Math.sin(2 * M) - .186 * Math.sin(sunAnomaly) - .114 * Math.sin(2 * F)) * rad;
    const lat = (5.128 * Math.sin(F) + .281 * Math.sin(M + F) + .278 * Math.sin(M - F)) * rad;
    const tilt = (23.439 - .00000036 * days) * rad;
    const ra = Math.atan2(Math.sin(lon) * Math.cos(tilt) - Math.tan(lat) * Math.sin(tilt), Math.cos(lon));
    const dec = Math.asin(Math.sin(lat) * Math.cos(tilt) + Math.cos(lat) * Math.sin(tilt) * Math.sin(lon));
    return { lon: lon / rad, lat: lat / rad, ra: (ra / rad + 360) % 360, dec: dec / rad };
  }
  const moonPhases = [
    [11.25, "New moon", "新月"], [78.75, "Waxing crescent", "蛾眉月"], [101.25, "First quarter", "上弦月"],
    [168.75, "Waxing gibbous", "盈凸月"], [191.25, "Full moon", "满月"], [258.75, "Waning gibbous", "亏凸月"],
    [281.25, "Last quarter", "下弦月"], [348.75, "Waning crescent", "残月"], [360, "New moon", "新月"]
  ];
  function unit(ra, dec) {
    return [Math.cos(dec * rad) * Math.cos(ra * rad), Math.cos(dec * rad) * Math.sin(ra * rad), Math.sin(dec * rad)];
  }
  function galacticToEquatorial(l, b) {
    const poleRa = 192.85948 * rad, poleDec = 27.12825 * rad, poleL = 122.93192 * rad;
    const lr = l * rad, br = b * rad;
    const dec = Math.asin(Math.sin(poleDec) * Math.sin(br) + Math.cos(poleDec) * Math.cos(br) * Math.cos(poleL - lr));
    const ra = poleRa + Math.atan2(Math.cos(br) * Math.sin(poleL - lr), Math.cos(poleDec) * Math.sin(br) - Math.sin(poleDec) * Math.cos(br) * Math.cos(poleL - lr));
    return { ra: (ra / rad + 360) % 360, dec: dec / rad };
  }

  // Face the celestial equator: south from the north, north from the south.
  const facing = SKY_PLACE.lat >= 0 ? 180 : 0;
  const altitudeSpan = 76;
  const altitudeFloor = -3;
  function project(alt, az) {
    const scale = height / altitudeSpan;
    const offset = ((az - facing + 540) % 360) - 180;
    return { x: width / 2 + offset * scale, y: height - (alt - altitudeFloor) * scale };
  }

  function seeded(seed) {
    let value = seed;
    return () => (value = (value * 16807) % 2147483647) / 2147483647;
  }
  function starColor(bv) {
    if (bv < 0) return "#bcd0fb";
    if (bv < .45) return "#e3eafa";
    if (bv < .9) return "#f4ead2";
    if (bv < 1.3) return "#f2d9b0";
    return "#efc29a";
  }
  function prepare() {
    const random = seeded(7);
    for (let i = 0; i < data.stars.length; i += 4) {
      const mag = data.stars[i + 2] / 10;
      stars.push({
        ra: data.stars[i] / 10,
        dec: data.stars[i + 1] / 10,
        mag,
        color: starColor(data.stars[i + 3] / 10),
        radius: Math.max(.5, 1.8 - mag * .27),
        opacity: Math.max(.36, 1 - mag * .12),
        phase: random() * Math.PI * 2,
        period: 3 + random() * 4,
        depth: .25 + Math.max(0, 4.5 - mag) / 6,
        excitement: 0,
        x: 0, y: 0, alt: -90
      });
    }
    lines = data.lines.map(([id, ...flat]) => {
      const points = [];
      for (let i = 0; i < flat.length; i += 2) points.push({ ra: flat[i] / 10, dec: flat[i + 1] / 10, x: 0, y: 0, alt: -90 });
      return { id, points };
    });
    data.names.forEach(([id, en, zh, ra, dec]) => names.set(id, { en, zh, ra: ra / 10, dec: dec / 10, x: 0, y: 0, alt: -90 }));
    const dustRandom = seeded(42);
    for (let i = 0; i < 900; i += 1) {
      const l = dustRandom() * 360;
      const spread = (dustRandom() + dustRandom() + dustRandom() - 1.5) * 9;
      const core = Math.cos(((l + 180) % 360 - 180) * rad * .5);
      dust.push({ ...galacticToEquatorial(l, spread * (1.1 - core * .4)), size: .35 + dustRandom() * .55, opacity: .12 + dustRandom() * .3 * (.6 + core * .4) });
    }
  }

  function placeAll(date) {
    const lst = siderealDegrees(date);
    for (const star of stars) {
      const h = horizontal(star.ra, star.dec, lst);
      const p = project(h.alt, h.az);
      star.alt = h.alt; star.x = p.x; star.y = p.y;
    }
    for (const line of lines) {
      for (const point of line.points) {
        const h = horizontal(point.ra, point.dec, lst);
        const p = project(h.alt, h.az);
        point.alt = h.alt; point.x = p.x; point.y = p.y;
      }
    }
    for (const name of names.values()) {
      const h = horizontal(name.ra, name.dec, lst);
      const p = project(h.alt, h.az);
      name.alt = h.alt; name.x = p.x; name.y = p.y;
    }
    const s = sunEquatorial(date);
    const sh = horizontal(s.ra, s.dec, lst);
    sun = { alt: sh.alt, x: project(sh.alt, sh.az).x };

    const m = moonEquatorial(date);
    const mh = horizontal(m.ra, m.dec, lst);
    // Seen from the ground rather than Earth's centre, the Moon sits about a degree lower.
    mh.alt -= .95 * Math.cos(mh.alt * rad);
    const mp = project(mh.alt, mh.az);
    const age = ((m.lon - s.lon) % 360 + 360) % 360;
    const elongation = Math.acos(Math.cos(m.lat * rad) * Math.cos((m.lon - s.lon) * rad));
    // The bright limb faces the Sun along the great circle joining them.
    const a = unit(m.ra, m.dec), b = unit(s.ra, s.dec);
    const toward = a.map((value, i) => value + (b[i] - value) * .02);
    const length = Math.hypot(...toward);
    const th = horizontal(Math.atan2(toward[1], toward[0]) / rad, Math.asin(toward[2] / length) / rad, lst);
    th.alt -= .95 * Math.cos(th.alt * rad);
    const tp = project(th.alt, th.az);
    moon = {
      alt: mh.alt, az: mh.az, x: mp.x, y: mp.y,
      lit: (1 - Math.cos(elongation)) / 2,
      cosine: Math.cos(elongation),
      limb: Math.abs(tp.x - mp.x) > width / 2 ? 0 : Math.atan2(tp.y - mp.y, tp.x - mp.x),
      phase: (([, en, zh]) => ({ en, zh }))(moonPhases.find(([limit]) => age < limit))
    };
  }

  // The Milky Way changes slowly, so it is painted off-screen and reused.
  function paintMilkyWay(date) {
    const lst = siderealDegrees(date);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
    milkyWay = milkyWay || document.createElement("canvas");
    milkyWay.width = Math.round(width * pixelRatio);
    milkyWay.height = Math.round(height * pixelRatio);
    const paint = milkyWay.getContext("2d");
    paint.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paint.clearRect(0, 0, width, height);
    paint.lineCap = "round";
    paint.lineJoin = "round";
    const scale = height / altitudeSpan;
    // Continuous runs along the galactic plane; one stroke per run avoids banding at the joins.
    function runs(from, to) {
      const result = [];
      let run = [];
      for (let l = from; l <= to; l += 2) {
        const e = galacticToEquatorial((l + 360) % 360, 0);
        const h = horizontal(e.ra, e.dec, lst);
        const p = project(h.alt, h.az);
        const last = run[run.length - 1];
        if (h.alt < -15 || (last && Math.abs(last.x - p.x) > width / 2)) {
          if (run.length > 1) result.push(run);
          run = h.alt < -15 ? [] : [p];
          continue;
        }
        run.push(p);
      }
      if (run.length > 1) result.push(run);
      return result;
    }
    function stroke(paths, layers, color) {
      paint.strokeStyle = color;
      for (const [band, alpha] of layers) {
        paint.globalAlpha = alpha;
        paint.lineWidth = band * scale;
        for (const path of paths) {
          paint.beginPath();
          paint.moveTo(path[0].x, path[0].y);
          path.slice(1).forEach(point => paint.lineTo(point.x, point.y));
          paint.stroke();
        }
      }
    }
    if ("filter" in paint) paint.filter = `blur(${Math.max(6, scale * 2.2)}px)`;
    stroke(runs(0, 360), [[22, .03], [13, .036], [6, .04]], "#b7c6e8");
    stroke(runs(-55, 55), [[16, .04], [8, .05]], "#d9cfe6");
    if ("filter" in paint) paint.filter = "none";
    paint.fillStyle = "#e6ecfa";
    for (const mote of dust) {
      const h = horizontal(mote.ra, mote.dec, lst);
      if (h.alt < -2) continue;
      const p = project(h.alt, h.az);
      if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) continue;
      paint.globalAlpha = mote.opacity * Math.min(1, (h.alt + 2) / 12);
      paint.beginPath();
      paint.arc(p.x, p.y, mote.size, 0, Math.PI * 2);
      paint.fill();
    }
    paint.globalAlpha = 1;
  }

  // Daylight dims the faintest stars; twilight warms the horizon where the sun is.
  function syncDaylight() {
    const root = document.documentElement;
    const twilight = sun.alt > 4 ? .35 : sun.alt > -18 ? Math.min(1, 1 - Math.abs(sun.alt + 4) / 14) : 0;
    const day = Math.max(0, Math.min(1, (sun.alt + 6) / 18));
    root.style.setProperty("--sky-twilight", twilight.toFixed(3));
    root.style.setProperty("--sky-day", day.toFixed(3));
    root.style.setProperty("--sky-sun-x", `${Math.max(-10, Math.min(110, sun.x / Math.max(1, width) * 100)).toFixed(1)}%`);
    root.dataset.skyPhase = sun.alt > 0 ? "day" : sun.alt > -6 ? "twilight" : sun.alt > -18 ? "dusk" : "night";
    if (skyLabel) {
      let time = "";
      try {
        time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SKY_PLACE.timeZone }).format(skyNow());
      } catch { /* An unknown time zone simply omits the clock. */ }
      const phase = moon ? ` · ${moon.phase.en} ${Math.round(moon.lit * 100)}%` : "";
      skyLabel.textContent = `Sky over ${SKY_PLACE.name}${time ? ` · ${time}` : ""}${phase}`;
    }
    // The point straight overhead: right ascension is local sidereal time, declination is latitude.
    if (zenithLabel) {
      const minutes = Math.floor(siderealDegrees(skyNow()) * 4);
      const dec = SKY_PLACE.lat.toFixed(1).replace("-", "−");
      zenithLabel.textContent = `ZENITH OVER ${SKY_PLACE.name.toUpperCase()} · RA ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m · DEC ${dec}°`;
      zenithLabel.hidden = false;
    }
  }

  function draw(step = 0) {
    const now = skyNow();
    placeAll(now);
    if (now - milkyWayAt > 20000) {
      paintMilkyWay(now);
      milkyWayAt = now.getTime();
      syncDaylight();
    }
    context.clearRect(0, 0, width, height);
    const daylight = Math.max(0, Math.min(1, (sun.alt + 6) / 18));
    if (milkyWay) {
      context.globalAlpha = 1 - daylight * .3;
      context.drawImage(milkyWay, parallax.x * .2, parallax.y * .2, width, height);
    }

    // Constellations near the pointer surface with their names.
    const nearby = new Map();
    if (pointer.active) {
      for (const line of lines) {
        for (const point of line.points) {
          if (point.alt < -1) continue;
          const near = 1 - Math.hypot(point.x - pointer.x, point.y - pointer.y) / 190;
          if (near > (nearby.get(line.id) || 0)) nearby.set(line.id, near);
        }
      }
    }
    for (const id of new Set([...glow.keys(), ...nearby.keys()])) {
      const value = glow.get(id) || 0;
      const near = nearby.get(id) || 0;
      const next = value + (near - value) * (1 - Math.exp(-step / (near > value ? 260 : 1100)));
      if (next < .005) glow.delete(id); else glow.set(id, next);
    }
    // Keep the sky behind the armillary sphere clear, so brass and starlines don't tangle.
    const instrument = document.querySelector('.binary-sky')?.getBoundingClientRect();
    const quiet = (x, y) => {
      if (!instrument || !instrument.width) return 1;
      const rx = instrument.width * .5, ry = instrument.height * .62;
      const d = Math.hypot((x - instrument.left - instrument.width / 2) / rx, (y - instrument.top - instrument.height / 2) / ry);
      return Math.min(1, Math.max(.08, (d - .55) / .45));
    };
    context.lineWidth = .7;
    for (const line of lines) {
      const shine = glow.get(line.id) || 0;
      const base = .05;
      for (let i = 1; i < line.points.length; i += 1) {
        const a = line.points[i - 1], b = line.points[i];
        if (a.alt < 0 && b.alt < 0) continue;
        if (Math.abs(a.x - b.x) > width / 2) continue;
        const readingMask = (a.x + b.x) / 2 < width * .55 ? .45 : 1;
        context.globalAlpha = (base * readingMask + shine * .5) * (1 - daylight * .25) * quiet((a.x + b.x) / 2, (a.y + b.y) / 2);
        // The sky is drawn in cool silver; brass belongs to the instrument.
        context.strokeStyle = shine > .05 ? "#c9d6ec" : "#9cbce4";
        context.beginPath();
        context.moveTo(a.x + parallax.x * .5, a.y + parallax.y * .5);
        context.lineTo(b.x + parallax.x * .5, b.y + parallax.y * .5);
        context.stroke();
      }
    }
    context.font = '11px "SFMono-Regular", Consolas, monospace';
    context.textAlign = "center";
    for (const [id, shine] of glow) {
      const name = names.get(id);
      if (!name || name.alt < 2 || shine < .12) continue;
      context.globalAlpha = Math.min(1, (shine - .12) * 1.6) * (name.x < width * .55 ? .4 : .8) * quiet(name.x, name.y);
      context.fillStyle = "#d3dcec";
      context.fillText(`${name.en.toUpperCase()} · ${name.zh}`, name.x + parallax.x * .5, name.y + parallax.y * .5 - 10);
    }

    for (const star of stars) {
      if (star.alt < -1) continue;
      const x = star.x + parallax.x * star.depth;
      const y = star.y + parallax.y * star.depth;
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      const twinkle = Math.sin(animationTime * Math.PI * 2 / star.period + star.phase);
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      const proximity = pointer.active ? Math.max(0, 1 - distance / 170) : 0;
      star.excitement += (proximity - star.excitement) * (1 - Math.exp(-step / (proximity > star.excitement ? 220 : 900)));
      // Keep the reading area quieter than the open sky to its right.
      const readingMask = x < width * .55 ? .68 : 1;
      const horizonFade = Math.min(1, (star.alt + 1) / 9);
      const daylightFade = (1 - daylight * Math.min(1, star.mag / 4.5) * .35) * moonWash(star.mag);
      const alpha = Math.min(1, ((star.opacity + twinkle * (star.mag < 2 ? .16 : .07)) * readingMask + star.excitement * .45) * horizonFade * daylightFade);
      if (alpha <= .01) continue;
      if (star.mag < 1.6) {
        const halo = context.createRadialGradient(x, y, 0, x, y, star.radius * 5.5);
        halo.addColorStop(0, star.color);
        halo.addColorStop(1, "transparent");
        context.globalAlpha = alpha * .25;
        context.fillStyle = halo;
        context.fillRect(x - star.radius * 5.5, y - star.radius * 5.5, star.radius * 11, star.radius * 11);
      }
      context.globalAlpha = alpha;
      context.fillStyle = star.color;
      context.beginPath();
      context.arc(x, y, star.radius + star.excitement * .55, 0, Math.PI * 2);
      context.fill();
    }
    drawMoon(step);
    drawMeteor();
    drawBurst();
    context.globalAlpha = 1;
    frameCount += 1;
  }

  function moonWash(mag) {
    if (!moon || moon.alt < 0) return 1;
    return 1 - moon.lit * Math.min(1, moon.alt / 15) * Math.min(1, mag / 5) * .3;
  }
  function moonRadius() {
    return Math.max(9, Math.min(16, height / altitudeSpan * 1.15));
  }
  function nearMoon(x, y) {
    if (!moon || moon.alt < -1) return false;
    return Math.hypot(x - moon.x - parallax.x * .15, y - moon.y - parallax.y * .15) < moonRadius() * 2.6;
  }

  // Phase drawn from the real elongation, bright limb turned toward the Sun.
  function drawMoon(step) {
    if (!moon || moon.alt < -2) return;
    const r = moonRadius();
    const x = moon.x + parallax.x * .15;
    const y = moon.y + parallax.y * .15;
    if (x < -r * 6 || x > width + r * 6 || y < -r * 6 || y > height + r * 6) return;
    const fade = Math.min(1, (moon.alt + 2) / 6);

    const halo = context.createRadialGradient(x, y, r * .8, x, y, r * (4 + moon.lit * 4));
    halo.addColorStop(0, "#efe6cc");
    halo.addColorStop(1, "transparent");
    context.globalAlpha = (.06 + moon.lit * .16) * fade;
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, r * (4 + moon.lit * 4), 0, Math.PI * 2);
    context.fill();

    // Earthshine keeps the unlit part faintly visible.
    context.globalAlpha = .14 * fade;
    context.fillStyle = "#8fa3c4";
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.translate(x, y);
    context.rotate(moon.limb);
    context.beginPath();
    context.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    context.ellipse(0, 0, Math.max(.01, Math.abs(moon.cosine) * r), r, 0, Math.PI / 2, -Math.PI / 2, moon.cosine > 0);
    context.closePath();
    const light = context.createRadialGradient(r * .35, -r * .3, r * .1, 0, 0, r * 1.1);
    light.addColorStop(0, "#fbf5e6");
    light.addColorStop(1, "#d9cfb6");
    context.globalAlpha = fade;
    context.fillStyle = light;
    context.fill();
    context.clip();
    context.rotate(-moon.limb);
    context.fillStyle = "#a99f88";
    context.globalAlpha = .28 * fade;
    for (const [mx, my, mr] of [[-.28, -.22, .3], [.18, -.3, .22], [.05, .2, .26], [-.35, .3, .16], [.38, .08, .14]]) {
      context.beginPath();
      context.arc(mx * r, my * r, mr * r, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    // The phase name appears on hover, or for a few seconds after a tap.
    const wanted = (pointer.active && nearMoon(pointer.x, pointer.y)) || animationTime < moonPinnedUntil ? 1 : 0;
    moonShine += (wanted - moonShine) * (step ? 1 - Math.exp(-step / (wanted > moonShine ? 220 : 700)) : 1);
    if (moonShine < .02) return;
    context.globalAlpha = moonShine * .85 * fade;
    context.fillStyle = "#e9dfc4";
    context.font = '11px "SFMono-Regular", Consolas, monospace';
    // Beside the Moon rather than above it, so it rarely lands on page text.
    const left = x > width * .7;
    context.textAlign = left ? "right" : "left";
    context.fillText(`${moon.phase.en.toUpperCase()} · ${moon.phase.zh} · ${Math.round(moon.lit * 100)}%`, left ? x - r - 12 : x + r + 12, y + 4);
  }

  function meteorHead() {
    if (!meteor) return null;
    const progress = (animationTime - meteor.start) / meteor.duration;
    const travel = Math.min(width * .4, 440);
    return { x: meteor.x - travel * progress, y: meteor.y + travel * .52 * progress, progress, travel };
  }

  function drawMeteor() {
    if (reducedMotion) return;
    if (!meteor && animationTime >= nextMeteorAt) {
      meteor = {
        start: animationTime,
        x: width * (.48 + Math.random() * .42),
        y: height * (.06 + Math.random() * .3),
        duration: 1.9 + Math.random() * .8
      };
    }
    if (!meteor) return;
    const head = meteorHead();
    if (head.progress >= 1) {
      meteor = null;
      nextMeteorAt = animationTime + 14 + Math.random() * 12;
      return;
    }
    const { x, y, progress, travel } = head;
    const tail = Math.min(120, travel * progress);
    if (tail < 1) return;
    const gradient = context.createLinearGradient(x, y, x + tail, y - tail * .52);
    gradient.addColorStop(0, "#e8e4d9");
    gradient.addColorStop(.18, "#b4c9e3");
    gradient.addColorStop(1, "transparent");
    context.globalAlpha = Math.sin(progress * Math.PI) * .8;
    context.strokeStyle = gradient;
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + tail, y - tail * .52);
    context.stroke();
    context.fillStyle = "#f4eedf";
    context.beginPath();
    context.arc(x, y, 1.6, 0, Math.PI * 2);
    context.fill();
  }

  // A caught meteor scatters into a small ring of sparks.
  function drawBurst() {
    if (!burst) return;
    const age = (animationTime - burst.start) / .9;
    if (age >= 1) { burst = null; return; }
    context.strokeStyle = "#f1e3bd";
    context.fillStyle = "#f6edd6";
    for (let i = 0; i < 10; i += 1) {
      const angle = i / 10 * Math.PI * 2 + burst.spin;
      const reach = 6 + age * 34;
      context.globalAlpha = (1 - age) * .9;
      context.beginPath();
      context.arc(burst.x + Math.cos(angle) * reach, burst.y + Math.sin(angle) * reach, 1.3 * (1 - age) + .3, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = (1 - age) * .5;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(burst.x, burst.y, 4 + age * 22, 0, Math.PI * 2);
    context.stroke();
  }

  function nearMeteor(x, y) {
    const head = meteorHead();
    if (!head || head.progress < .05) return false;
    if (Math.hypot(x - head.x, y - head.y) < 42) return true;
    // Also accept a touch on the first stretch of the tail.
    const tail = Math.min(120, head.travel * head.progress) * .6;
    const tx = head.x + tail, ty = head.y - tail * .52;
    const length = Math.hypot(tx - head.x, ty - head.y) || 1;
    const along = ((x - head.x) * (tx - head.x) + (y - head.y) * (ty - head.y)) / length ** 2;
    if (along < 0 || along > 1) return false;
    return Math.hypot(x - (head.x + along * (tx - head.x)), y - (head.y + along * (ty - head.y))) < 22;
  }

  function onCatchAttempt(event) {
    if (event.target.closest("a, button, input, textarea, select, dialog, [role='dialog']")) return;
    if (nearMoon(event.clientX, event.clientY)) {
      moonPinnedUntil = animationTime + 4;
      if (!running) draw();
      document.dispatchEvent(new CustomEvent("lab:moon-touched", { detail: { phase: moon.phase.en, illumination: moon.lit } }));
    }
    if (!meteor || !running) return;
    if (!nearMeteor(event.clientX, event.clientY)) return;
    const head = meteorHead();
    burst = { x: head.x, y: head.y, start: animationTime, spin: Math.random() * Math.PI };
    meteor = null;
    nextMeteorAt = animationTime + 14 + Math.random() * 12;
    document.documentElement.classList.remove("meteor-near");
    document.dispatchEvent(new CustomEvent("lab:meteor-caught"));
  }

  function tick(timestamp) {
    requestId = null;
    if (!running) return;
    if (previousTime === null) previousTime = timestamp;
    const elapsed = timestamp - previousTime;
    if (elapsed >= frameInterval) {
      const step = Math.min(80, Math.floor(elapsed / frameInterval) * frameInterval);
      previousTime = timestamp - elapsed % frameInterval;
      animationTime += step / 1000;
      const smoothing = 1 - Math.exp(-step / 650);
      parallax.x += (target.x - parallax.x) * smoothing;
      parallax.y += (target.y - parallax.y) * smoothing;
      draw(step);
    }
    requestId = window.requestAnimationFrame(tick);
  }

  function syncLoop() {
    const shouldRun = visible && inViewport && !reducedMotion && !userPaused;
    if (shouldRun === running) return;
    running = shouldRun;
    previousTime = null;
    if (running) {
      requestId = window.requestAnimationFrame(tick);
    } else {
      if (requestId !== null) window.cancelAnimationFrame(requestId);
      requestId = null;
      meteor = null;
      document.documentElement.classList.remove("meteor-near");
    }
  }

  function resetPointer() {
    pointer.active = false;
    target.x = 0;
    target.y = 0;
  }

  function onPointerMove(event) {
    if (!running || event.pointerType !== "mouse") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    target.x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1)) * parallaxLimit;
    target.y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1)) * parallaxLimit;
    document.documentElement.classList.toggle("meteor-near", nearMeteor(event.clientX, event.clientY) || nearMoon(event.clientX, event.clientY));
  }

  function syncPointer() {
    const shouldEnable = pointerPreference.matches && !reducedMotion && !userPaused;
    if (shouldEnable === pointerEnabled) return;
    pointerEnabled = shouldEnable;
    if (pointerEnabled) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", resetPointer, { passive: true });
      window.addEventListener("blur", resetPointer);
    } else {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer);
      resetPointer();
    }
  }

  function syncButton() {
    if (!button || !label) return;
    button.hidden = false;
    button.disabled = reducedMotion;
    button.setAttribute("aria-pressed", String(userPaused || reducedMotion));
    button.setAttribute("aria-label", reducedMotion ? "Star animation paused by your reduced motion preference" : userPaused ? "Resume star animation" : "Pause star animation");
    label.textContent = reducedMotion ? "Stars still · system" : userPaused ? "Resume stars" : "Pause stars";
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    milkyWayAt = -Infinity;
    draw();
  }

  motionPreference.addEventListener("change", () => {
    reducedMotion = motionPreference.matches;
    syncLoop();
    syncPointer();
    if (reducedMotion) {
      meteor = null;
      burst = null;
      nextMeteorAt = animationTime + 5 + Math.random() * 4;
      stars.forEach(star => { star.excitement = 0; });
      glow.clear();
      resetPointer();
      parallax.x = 0;
      parallax.y = 0;
      draw();
    }
    syncButton();
  });

  pointerPreference.addEventListener("change", () => {
    syncPointer();
    if (!pointerEnabled) {
      stars.forEach(star => { star.excitement = 0; });
      glow.clear();
      parallax.x = 0;
      parallax.y = 0;
      draw();
    }
  });

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    resetPointer();
    syncLoop();
  });

  if (button) {
    button.addEventListener("click", () => {
      if (reducedMotion) return;
      userPaused = !userPaused;
      syncLoop();
      syncPointer();
      syncButton();
    });
  }

  prepare();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("pointerdown", onCatchAttempt);
  resize();
  canvas.parentElement.classList.add("has-canvas");
  syncPointer();
  syncButton();
  // A still sky keeps its clock and twilight current without animating.
  window.setInterval(() => { if (!running) { milkyWayAt = -Infinity; draw(); } }, 60000);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      inViewport = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
      if (!inViewport) resetPointer();
      syncLoop();
    });
    observer.observe(canvas);
  } else {
    const checkViewport = () => {
      const bounds = canvas.getBoundingClientRect();
      inViewport = bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
      syncLoop();
    };
    window.addEventListener("scroll", checkViewport, { passive: true });
    window.addEventListener("resize", checkViewport, { passive: true });
    checkViewport();
  }
})();
