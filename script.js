(() => {
  "use strict";

  // The sky above one fixed place (set in sky-place.js), at the visitor's current moment.
  const SKY_PLACE = window.LAB_SKY_PLACE || { name: "Greenwich", lat: 51.4769, lon: -0.0005, timeZone: "Europe/London" };
  // The azimuth the view faces (0 is north, 90 east), from the place's `look` setting.
  // Visitors can turn around to the opposite side; the view then swings smoothly across.
  const homeFacing = (() => {
    const look = SKY_PLACE.look ?? "pole";
    const pole = SKY_PLACE.lat < 0 ? 180 : 0;
    const named = { pole, equator: (pole + 180) % 360, north: 0, east: 90, south: 180, west: 270 };
    if (look in named) return named[look];
    return Number.isFinite(Number(look)) ? ((Number(look) % 360) + 360) % 360 : pole;
  })();
  let facing = homeFacing;
  let facingTarget = homeFacing;
  const turning = () => Math.abs(((facingTarget - facing + 540) % 360) - 180) > .01;
  // Preview another moment with ?sky-time=2026-10-30T02:00:00+11:00; the sky then runs on from there.
  const skyOffset = (() => {
    const requested = Date.parse(new URLSearchParams(location.search).get("sky-time") || "");
    return Number.isFinite(requested) ? requested - Date.now() : 0;
  })();
  // The armillary's time dial can move the whole sky to another date for a while.
  // Whole days go into the clock; the fraction of a day only nudges the stars, Sun and Moon
  // along by that much of their daily drift, so the hour stays put while the date glides.
  let dialOffset = 0;
  let dialFraction = 0;
  let daylightAt = 0;
  let dialFrame = null;
  const skyNow = () => new Date(Date.now() + skyOffset + dialOffset);
  // A small clock for other pieces of the sky, such as the armillary sphere.
  window.LAB_SKY = Object.freeze({
    place: SKY_PLACE,
    get facing() { return facing; },
    turn() {
      facingTarget = (facingTarget + 180) % 360;
      syncLookButton();
      // A still sky turns at once; a running one swings round over the next second or so.
      if (!running) {
        facing = facingTarget;
        milkyWayAt = -Infinity;
        draw();
      }
      document.dispatchEvent(new CustomEvent("lab:sky-turn", { detail: { facing: facingTarget } }));
    },
    now: skyNow,
    sidereal: () => siderealDegrees(skyNow()),
    sunLongitude: () => sunEquatorial(ephemeris(skyNow())).lon,
    moon: () => moonEquatorial(ephemeris(skyNow())),
    planets: () => planetPositions(ephemeris(skyNow())),
    dial: () => dialOffset + dialFraction * 86400000,
    setDial(ms) {
      const days = Number.isFinite(ms) ? ms / 86400000 : 0;
      const whole = Math.round(days);
      dialOffset = whole * 86400000;
      dialFraction = days - whole;
      document.documentElement.classList.toggle("sky-dialing", days !== 0);
      // Back to now: paint the Milky Way at full quality again.
      if (!days) milkyWayAt = -Infinity;
      // A still sky redraws on request; a running one picks the change up on its next frame.
      if (!running && dialFrame === null) dialFrame = requestAnimationFrame(() => { dialFrame = null; draw(); });
    }
  });

  const canvas = document.getElementById("starfield");
  const button = document.getElementById("motion-toggle");
  const label = document.getElementById("motion-label");
  const skyLabel = document.getElementById("sky-place");
  const zenithLabel = document.getElementById("sky-zenith");
  const lookButton = document.querySelector(".look-toggle");
  const compass = ["north", "east", "south", "west"];
  function syncLookButton() {
    if (!lookButton) return;
    const toward = compass[Math.round(((facingTarget + 180) % 360) / 90) % 4];
    const now = compass[Math.round(facingTarget / 90) % 4];
    // The needle points the way the sky faces; a click turns it round.
    lookButton.style.setProperty("--needle", `${facingTarget}deg`);
    lookButton.setAttribute("aria-label", `Facing ${now}. Turn the sky to face ${toward}`);
    lookButton.title = `Facing ${now} · turn to the ${toward}`;
    lookButton.hidden = false;
  }
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
  let planets = [];
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
  lookButton?.addEventListener("click", () => window.LAB_SKY.turn());
  syncLookButton();
  try {
    context = canvas.getContext("2d", { alpha: true });
  } catch {
    return;
  }
  if (!context) return;

  // --- Astronomy: low-precision formulas, plenty for a background sky. ---
  function siderealDegrees(date) {
    const days = date.getTime() / 86400000 - 10957.5;
    return ((280.46061837 + 360.98564736629 * days + .98564736629 * dialFraction + SKY_PLACE.lon) % 360 + 360) % 360;
  }
  // The Sun and Moon move on with the dial's fraction of a day, so they glide instead of stepping.
  function ephemeris(date) {
    return dialFraction ? new Date(date.getTime() + dialFraction * 86400000) : date;
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
  // Naked-eye planets from JPL's approximate Keplerian elements (Standish, valid 1800–2050):
  // a (au), e, I, L, longitude of perihelion, node (degrees), each with its rate per century.
  const planetElements = {
    earth: [1.00000261, .00000562, .01671123, -.00004392, -.00001531, -.01294668, 100.46457166, 35999.37244981, 102.93768193, .32327364, 0, 0],
    mercury: [.38709927, .00000037, .20563593, .00001906, 7.00497902, -.00594749, 252.2503235, 149472.67411175, 77.45779628, .16047689, 48.33076593, -.12534081],
    venus: [.72333566, .0000039, .00677672, -.00004107, 3.39467605, -.0007889, 181.9790995, 58517.81538729, 131.60246718, .00268329, 76.67984255, -.27769418],
    mars: [1.52371034, .00001847, .0933941, .00007882, 1.84969142, -.00813131, -4.55343205, 19140.30268499, -23.94362959, .44441088, 49.55953891, -.29257343],
    jupiter: [5.202887, -.00011607, .04838624, -.00013253, 1.30439695, -.00183714, 34.39644051, 3034.74612775, 14.72847983, .21252668, 100.47390909, .20469106],
    saturn: [9.53667594, -.0012506, .05386179, -.00050991, 2.48599187, .00193609, 49.95424423, 1222.49362201, 92.59887831, -.41897216, 113.66242448, -.28867794]
  };
  // Name, 中文, colour, and the magnitude law: absolute magnitude plus phase-angle terms.
  const planetLooks = [
    ["mercury", "Mercury", "水星", "#e2d3b8", i => -.42 + .038 * i - .000273 * i * i + .000002 * i ** 3],
    ["venus", "Venus", "金星", "#fff7e6", i => -4.4 + .0009 * i + .000239 * i * i - .00000065 * i ** 3],
    ["mars", "Mars", "火星", "#ffa47a", i => -1.52 + .016 * i],
    ["jupiter", "Jupiter", "木星", "#f6e8cf", i => -9.4 + .005 * i],
    // Saturn's rings add a little light on average; the law alone leaves it too faint.
    ["saturn", "Saturn", "土星", "#efdcab", i => -9.15 + .044 * i]
  ];
  // Heliocentric position in ecliptic coordinates (J2000), in au.
  function heliocentric(name, date) {
    const t = (date.getTime() / 86400000 - 10957.5) / 36525;
    const el = planetElements[name];
    const at = k => el[k * 2] + el[k * 2 + 1] * t;
    const a = at(0), e = at(1), inc = at(2) * rad, longitude = at(3), perihelion = at(4), node = at(5) * rad;
    const anomaly = ((((longitude - perihelion) % 360) + 540) % 360 - 180) * rad;
    let E = anomaly + e * Math.sin(anomaly);
    for (let i = 0; i < 6; i += 1) E -= (E - e * Math.sin(E) - anomaly) / (1 - e * Math.cos(E));
    const px = a * (Math.cos(E) - e), py = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = perihelion * rad - node;
    const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(inc), si = Math.sin(inc);
    return [
      (cw * cn - sw * sn * ci) * px + (-sw * cn - cw * sn * ci) * py,
      (cw * sn + sw * cn * ci) * px + (-sw * sn + cw * cn * ci) * py,
      sw * si * px + cw * si * py
    ];
  }
  function planetPositions(date) {
    const earth = heliocentric("earth", date);
    const tilt = 23.43928 * rad;
    return planetLooks.map(([key, en, zh, color, law]) => {
      const sunward = heliocentric(key, date);
      const g = sunward.map((v, i) => v - earth[i]);
      const distance = Math.hypot(...g), fromSun = Math.hypot(...sunward), earthSun = Math.hypot(...earth);
      const phase = Math.acos(Math.max(-1, Math.min(1, (fromSun ** 2 + distance ** 2 - earthSun ** 2) / (2 * fromSun * distance)))) / rad;
      const y = g[1] * Math.cos(tilt) - g[2] * Math.sin(tilt), z = g[1] * Math.sin(tilt) + g[2] * Math.cos(tilt);
      return {
        key, en, zh, color,
        ra: (Math.atan2(y, g[0]) / rad + 360) % 360,
        dec: Math.asin(z / distance) / rad,
        lon: (Math.atan2(g[1], g[0]) / rad + 360) % 360,
        mag: law(phase) + 5 * Math.log10(fromSun * distance)
      };
    });
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
  // Naked-eye nebulae, clusters and galaxies at their real places:
  // [English, 中文, RA°, Dec°, length°, width°, position angle°, brightness, colour].
  const deepSky = [
    ["Orion Nebula", "猎户座大星云", 83.82, -5.39, 1.1, .8, 0, .9, "#ddd6f0"],
    ["Lagoon Nebula", "礁湖星云", 270.92, -24.38, 1.5, .6, 90, .75, "#e6d6e6"],
    ["Trifid Nebula", "三叶星云", 270.6, -23.03, .5, .5, 0, .3, "#e2d8ec"],
    ["Carina Nebula", "船底座星云", 161.27, -59.87, 2, 1.6, 0, .9, "#e6d6e6"],
    ["Andromeda Galaxy", "仙女座星系", 10.68, 41.27, 3.2, 1, 35, .8, "#ece4d4"],
    ["Large Magellanic Cloud", "大麦哲伦云", 80.89, -69.76, 9, 5, 170, 1.9, "#e4e7f2"],
    ["Small Magellanic Cloud", "小麦哲伦云", 13.19, -72.83, 4.5, 2.6, 45, 1.5, "#e4e7f2"],
    ["Omega Centauri", "半人马座 ω 星团", 201.7, -47.48, .8, .8, 0, .5, "#efe6d2"],
    ["Beehive Cluster", "鬼星团", 130.1, 19.67, 1.2, 1.2, 0, .4, "#e3e8f4"],
    ["Ptolemy Cluster", "托勒密星团", 268.47, -34.79, 1.3, 1.3, 0, .4, "#e3e8f4"]
  ].map(([en, zh, ra, dec, major, minor, angle, bright, color]) => ({ en, zh, ra, dec, major, minor, angle, bright, color, shine: 0 }));

  // Constellation figures (sky-figures.js) load the first time their constellation lights up,
  // then are tinted to the sky's silver once and kept.
  const figureData = window.LAB_SKY_FIGURES;
  const figures = new Map();
  function figureFor(id) {
    const key = figureData && (figureData.figures[id] ? id : figureData.alias[id]);
    const spec = key && figureData.figures[key];
    if (!spec) return null;
    let figure = figures.get(key);
    if (!figure) {
      figure = { spec, canvas: null };
      figures.set(key, figure);
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        const [w, h] = spec.size;
        const tinted = document.createElement("canvas");
        tinted.width = w;
        tinted.height = h;
        const paint = tinted.getContext("2d");
        paint.drawImage(image, 0, 0, w, h);
        // Redraw the painting as a sketch in light: its edges bright, its body only a faint wash,
        // in silver. Brightness becomes transparency, because the starfield canvas is itself
        // transparent over the CSS sky: an opaque black would darken the sky behind it.
        const pixels = paint.getImageData(0, 0, w, h);
        const source = pixels.data;
        const lum = new Float32Array(w * h);
        for (let i = 0; i < lum.length; i += 1) lum[i] = source[i * 4] / 255;
        const tint = [201, 214, 236];
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const i = y * w + x;
            const at = (dx, dy) => lum[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
            const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
            const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
            // Fade out near the border, where some paintings are cut off by the frame.
            const border = Math.min(1, Math.min(x, y, w - 1 - x, h - 1 - y) / (w * .08));
            const light = Math.min(1, lum[i] * .3 + Math.hypot(gx, gy) * .9) * border;
            source[i * 4] = tint[0];
            source[i * 4 + 1] = tint[1];
            source[i * 4 + 2] = tint[2];
            source[i * 4 + 3] = 255 * light;
          }
        }
        paint.putImageData(pixels, 0, 0);
        figure.canvas = tinted;
      };
      image.src = figureData.base + spec.file;
    }
    return figure;
  }
  // The affine map that carries three image points onto three screen points.
  function pinFigure(anchors, screen) {
    const [p0, p1, p2] = anchors, [q0, q1, q2] = screen;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], wx = p2[0] - p0[0], wy = p2[1] - p0[1];
    const vx = q1.x - q0.x, vy = q1.y - q0.y, tx = q2.x - q0.x, ty = q2.y - q0.y;
    const det = ux * wy - wx * uy;
    if (!det) return null;
    const a = (vx * wy - tx * uy) / det, c = (tx * ux - vx * wx) / det;
    const b = (vy * wy - ty * uy) / det, d = (ty * ux - vy * wx) / det;
    return [a, b, c, d, q0.x - a * p0[0] - c * p0[1], q0.y - b * p0[0] - d * p0[1]];
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
    // Planets keep their hover glow between frames.
    const glowOf = new Map(planets.map(p => [p.key, p.shine]));
    planets = planetPositions(ephemeris(date)).map(p => {
      const h = horizontal(p.ra, p.dec, lst);
      return { ...p, ...project(h.alt, h.az), alt: h.alt, shine: glowOf.get(p.key) || 0 };
    });
    const s = sunEquatorial(ephemeris(date));
    const sh = horizontal(s.ra, s.dec, lst);
    sun = { alt: sh.alt, x: project(sh.alt, sh.az).x };

    const m = moonEquatorial(ephemeris(date));
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
  function paintMilkyWay(date, quick = false) {
    const lst = siderealDegrees(date);
    // A quick paint is a third of the size: soft anyway, and cheap enough for every frame.
    const pixelRatio = quick ? .33 : Math.min(window.devicePixelRatio || 1, dprCap);
    milkyWay = milkyWay || document.createElement("canvas");
    const w = Math.round(width * pixelRatio), h = Math.round(height * pixelRatio);
    if (milkyWay.width !== w || milkyWay.height !== h) { milkyWay.width = w; milkyWay.height = h; }
    const paint = milkyWay.getContext("2d");
    paint.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    paint.clearRect(0, 0, width, height);
    paint.lineCap = "round";
    paint.lineJoin = "round";
    const scale = height / altitudeSpan;
    // Continuous runs along the galactic plane; one stroke per run avoids banding at the joins.
    function runs(from, to, b = 0) {
      const result = [];
      let run = [];
      for (let l = from; l <= to; l += 2) {
        const e = galacticToEquatorial((l + 360) % 360, b);
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
    // The whole band, cool and faint, brightening and warming toward the galaxy's centre
    // in Sagittarius, where a thick bulge swells around the core.
    stroke(runs(0, 360), [[22, .03], [13, .036], [6, .04]], "#b7c6e8");
    stroke(runs(-90, 90), [[16, .025]], "#c6cde6");
    stroke(runs(-55, 55), [[14, .035], [8, .045]], "#d6d1e6");
    stroke(runs(-28, 28), [[12, .045], [6, .05]], "#e4dccd");
    stroke(runs(-12, 12), [[24, .045], [14, .05]], "#ecdfc6");
    // Dust carved back out: the Great Rift from Cygnus to Sagittarius, the dark lanes
    // beside the core, and the Coalsack by the Southern Cross.
    paint.globalCompositeOperation = "destination-out";
    stroke(runs(8, 82, 1.2), [[4.5, .45], [2.4, .35]], "#000");
    stroke(runs(-6, 8, 3.5), [[3, .4]], "#000");
    stroke(runs(-14, -4, -2.5), [[2.5, .3]], "#000");
    stroke(runs(298, 304, -1), [[6, .5]], "#000");
    paint.globalCompositeOperation = "source-over";
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
        // A dialled sky names its date, so the clock never pretends to be now.
        const format = dialOffset ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" };
        time = new Intl.DateTimeFormat("en-GB", { ...format, timeZone: SKY_PLACE.timeZone }).format(skyNow());
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
    if (dialOffset || dialFraction || turning()) {
      // While the dial turns or the view swings round, a small, quick Milky Way follows every frame; the tint and
      // labels, which repaint the whole page, follow ten times a second.
      paintMilkyWay(now, true);
      milkyWayAt = -Infinity;
      if (performance.now() - daylightAt > 100) { daylightAt = performance.now(); syncDaylight(); }
    } else if (Math.abs(now - milkyWayAt) > 20000) {
      paintMilkyWay(now);
      milkyWayAt = now.getTime();
      syncDaylight();
    }
    context.clearRect(0, 0, width, height);
    const daylight = Math.max(0, Math.min(1, (sun.alt + 6) / 18));
    // A zero-sized canvas (a hidden or not-yet-laid-out page) has nothing to draw yet.
    if (milkyWay && milkyWay.width && milkyWay.height) {
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
    const lstNow = siderealDegrees(now);
    const perDegree = height / altitudeSpan;
    // Nebulae and galaxies: soft glows, a little larger than the eye would see them,
    // that brighten and name themselves when the pointer comes near.
    context.font = '11px "SFMono-Regular", Consolas, monospace';
    context.textAlign = "center";
    for (const object of deepSky) {
      const h = horizontal(object.ra, object.dec, lstNow);
      if (h.alt < -3) continue;
      const p = project(h.alt, h.az);
      const x = p.x + parallax.x * .3, y = p.y + parallax.y * .3;
      // Small objects are drawn larger than life so they read as glows; large ones at true size.
      const grow = object.major > 3 ? .8 : 1.6;
      const major = object.major * perDegree * grow + 7, minor = object.minor * perDegree * grow + 5;
      if (x < -major || x > width + major || y < -major || y > height + major) continue;
      // North and east on screen, to lay the glow along its real angle on the sky.
      const nh = horizontal(object.ra, object.dec + .5, lstNow), np = project(nh.alt, nh.az);
      const eh = horizontal(object.ra + .5 / Math.max(.1, Math.cos(object.dec * rad)), object.dec, lstNow), ep = project(eh.alt, eh.az);
      const angle = Math.abs(np.x - p.x) > width / 2 || Math.abs(ep.x - p.x) > width / 2 ? 0
        : Math.atan2((np.y - p.y) * Math.cos(object.angle * rad) + (ep.y - p.y) * Math.sin(object.angle * rad),
          (np.x - p.x) * Math.cos(object.angle * rad) + (ep.x - p.x) * Math.sin(object.angle * rad));
      const target = pointer.active ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 110) : 0;
      object.shine += (target - object.shine) * (1 - Math.exp(-step / (target > object.shine ? 300 : 1000)));
      const placeFade = Math.min(1, (h.alt + 3) / 9) * quiet(x, y) * (x < width * .55 ? .5 : 1);
      const glowAlpha = object.bright * .2 * (1 + object.shine * .9) * placeFade * (1 - daylight * .85) * moonWash(4);
      if (glowAlpha < .005) continue;
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.scale(major, minor);
      const glowFill = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      glowFill.addColorStop(0, object.color);
      glowFill.addColorStop(.3, object.color + "88");
      glowFill.addColorStop(1, object.color + "00");
      context.globalAlpha = glowAlpha;
      context.fillStyle = glowFill;
      context.beginPath();
      context.arc(0, 0, 1, 0, Math.PI * 2);
      context.fill();
      context.restore();
      if (object.shine > .15) {
        // Names stay readable by day, like the constellations'.
        context.globalAlpha = Math.min(1, (object.shine - .15) * 1.6) * .8 * placeFade;
        context.fillStyle = "#d3dcec";
        context.fillText(`${object.en.toUpperCase()} · ${object.zh}`, x, y - minor - 8);
      }
    }

    // Behind the lines, a faint figure of what the constellation was imagined to be.
    const figureShine = new Map();
    for (const [id, shine] of glow) {
      if (shine < .02) continue;
      const figure = figureFor(id);
      if (figure) figureShine.set(figure, Math.max(shine, figureShine.get(figure) || 0));
    }
    if (figureShine.size) {
      const lst = lstNow;
      for (const [figure, shine] of figureShine) {
        if (!figure.canvas) continue;
        const screen = figure.spec.anchors.map(([, , ra, dec]) => {
          const h = horizontal(ra, dec, lst);
          return { ...project(h.alt, h.az), alt: h.alt };
        });
        if (screen.every(p => p.alt < -5)) continue;
        // A figure split by the projection's seam (half the sky round) would stretch across the screen.
        const seam = 120 * height / altitudeSpan;
        if (Math.abs(screen[0].x - screen[1].x) > seam || Math.abs(screen[0].x - screen[2].x) > seam || Math.abs(screen[1].x - screen[2].x) > seam) continue;
        const pin = pinFigure(figure.spec.anchors, screen);
        if (!pin) continue;
        const cx = (screen[0].x + screen[1].x + screen[2].x) / 3, cy = (screen[0].y + screen[1].y + screen[2].y) / 3;
        context.save();
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = shine * .3 * (cx < width * .55 ? .4 : 1) * (1 - daylight * .4) * quiet(cx, cy);
        context.transform(pin[0], pin[1], pin[2], pin[3], pin[4] + parallax.x * .5, pin[5] + parallax.y * .5);
        context.drawImage(figure.canvas, 0, 0);
        context.restore();
      }
    }

    context.lineWidth = .7;
    for (const line of lines) {
      const shine = glow.get(line.id) || 0;
      const base = .05;
      for (let i = 1; i < line.points.length; i += 1) {
        const a = line.points[i - 1], b = line.points[i];
        if (a.alt < 0 && b.alt < 0) continue;
        if (Math.abs(a.x - b.x) > width / 2) continue;
        const readingMask = (a.x + b.x) / 2 < width * .55 ? .45 : 1;
        context.globalAlpha = (base * readingMask + shine * .32) * (1 - daylight * .25) * quiet((a.x + b.x) / 2, (a.y + b.y) / 2);
        // The sky is drawn in cool silver; brass belongs to the instrument.
        context.strokeStyle = shine > .05 ? "#c9d6ec" : "#9cbce4";
        // Lines stop just short of their stars, as on a printed star chart.
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const gap = Math.min(4.5, length * .3) / length;
        const dx = (b.x - a.x) * gap, dy = (b.y - a.y) * gap;
        context.beginPath();
        context.moveTo(a.x + dx + parallax.x * .5, a.y + dy + parallax.y * .5);
        context.lineTo(b.x - dx + parallax.x * .5, b.y - dy + parallax.y * .5);
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
    drawPlanets(step, daylight);
    drawMoon(step);
    drawMeteor();
    drawBurst();
    context.globalAlpha = 1;
    frameCount += 1;
  }

  // Planets shine steadily, without twinkling, and name themselves when the pointer comes near.
  function drawPlanets(step, daylight) {
    for (const planet of planets) {
      if (planet.alt < -1) continue;
      const x = planet.x + parallax.x * .3, y = planet.y + parallax.y * .3;
      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
      const target = pointer.active ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 90) : 0;
      planet.shine += (target - planet.shine) * (1 - Math.exp(-step / (target > planet.shine ? 250 : 900)));
      const r = Math.max(1.2, 2.2 - planet.mag * .3);
      // The brightest planets outlast the stars into twilight and the bright sky.
      const daylightFade = 1 - daylight * Math.min(1, Math.max(0, (planet.mag + 4.5) / 6)) * .7;
      const alpha = Math.min(1, (.9 + planet.shine * .1) * Math.min(1, (planet.alt + 1) / 6) * daylightFade * (x < width * .55 ? .8 : 1));
      if (alpha <= .01) continue;
      const halo = context.createRadialGradient(x, y, 0, x, y, r * 6);
      halo.addColorStop(0, planet.color);
      halo.addColorStop(1, "transparent");
      context.globalAlpha = alpha * (.18 + Math.max(0, -planet.mag) * .05 + planet.shine * .15);
      context.fillStyle = halo;
      context.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      context.globalAlpha = alpha;
      context.fillStyle = planet.color;
      context.beginPath();
      context.arc(x, y, r + planet.shine * .5, 0, Math.PI * 2);
      context.fill();
      if (planet.shine > .15) {
        context.globalAlpha = Math.min(1, (planet.shine - .15) * 1.6) * .85 * Math.min(1, (planet.alt + 1) / 6);
        context.font = '11px "SFMono-Regular", Consolas, monospace';
        context.textAlign = "center";
        context.fillStyle = "#d3dcec";
        context.fillText(`${planet.en.toUpperCase()} · ${planet.zh}`, x, y - r - 10);
      }
    }
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
    // The sky keeps pace with the armillary while its dial turns, and while the view swings round.
    const interval = dialOffset || dialFraction || turning() ? 1000 / 60 : frameInterval;
    if (elapsed >= interval) {
      const step = Math.min(80, Math.floor(elapsed / interval) * interval);
      previousTime = timestamp - elapsed % interval;
      animationTime += step / 1000;
      const smoothing = 1 - Math.exp(-step / 650);
      parallax.x += (target.x - parallax.x) * smoothing;
      parallax.y += (target.y - parallax.y) * smoothing;
      if (turning()) {
        const left = ((facingTarget - facing + 540) % 360) - 180;
        const move = left * (1 - Math.exp(-step / 380));
        facing = (facing + (Math.abs(left) < .3 ? left : Math.sign(left) * Math.max(Math.abs(move), .25)) + 360) % 360;
        // Arrived: paint the Milky Way at full quality again.
        if (!turning()) milkyWayAt = -Infinity;
      }
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
