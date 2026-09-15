(() => {
  "use strict";

  const canvas = document.getElementById("starfield");
  const button = document.getElementById("motion-toggle");
  const label = document.getElementById("motion-label");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointerPreference = window.matchMedia("(min-width: 801px) and (hover: hover) and (pointer: fine)");
  const fpsCap = 30;
  const dprCap = 1.5;
  const frameInterval = 1000 / fpsCap;
  const parallaxLimit = 18;
  let context = null;
  let particles = [];
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
  let nextMeteorAt = 5 + Math.random() * 4;
  const pointer = { x: 0, y: 0, active: false };
  const parallax = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };

  Object.defineProperty(window, "__labStarfieldState", {
    configurable: false,
    enumerable: false,
    get: () => Object.freeze({
      frameCount,
      running,
      particleCount: particles.length,
      reducedMotion,
      visible,
      inViewport,
      pointerEnabled,
      constellationStars: particles.filter(particle => particle.excitement > .05).length,
      meteorActive: meteor !== null,
      parallax: Object.freeze({ x: parallax.x, y: parallax.y }),
      fpsCap,
      dprCap
    })
  });

  if (!canvas) return;
  try {
    context = canvas.getContext("2d", { alpha: true });
  } catch {
    return;
  }
  if (!context) return;

  function makeParticle() {
    const depth = Math.random();
    const layer = depth < .55 ? 0 : depth < .9 ? 1 : 2;
    return {
      x: Math.random(),
      y: Math.random(),
      layer,
      radius: [.45, .75, 1.1][layer] + Math.random() * .45,
      phase: Math.random() * Math.PI * 2,
      period: 3 + Math.random() * 4,
      opacity: [.20, .36, .57][layer] + Math.random() * .14,
      speed: [.12, .65, 1.1][layer] + Math.random() * .3,
      depth: [4 / 18, 10 / 18, 1][layer],
      warm: Math.random() < .18,
      excitement: 0
    };
  }

  function draw(step = 0) {
    context.clearRect(0, 0, width, height);
    const points = [];
    for (const particle of particles) {
      const twinkle = Math.sin(animationTime * Math.PI * 2 / particle.period + particle.phase);
      // Wrap outside the viewport, so moving stars never snap at the edge.
      const x = ((particle.x * (width + 60) + animationTime * particle.speed) % (width + 60)) - 30 + parallax.x * particle.depth;
      const y = ((particle.y * (height + 60) + animationTime * particle.speed * .25) % (height + 60)) - 30 + parallax.y * particle.depth;
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      const proximity = pointer.active ? Math.max(0, 1 - distance / 210) : 0;
      particle.excitement += (proximity - particle.excitement) * (1 - Math.exp(-step / (proximity > particle.excitement ? 220 : 900)));
      points.push({ x, y, excitement: particle.excitement });
      // Keep the reading area quieter than the open sky to its right.
      const readingMask = x < width * .55 ? .68 : 1;
      const alpha = Math.min(1, (particle.opacity + twinkle * (particle.layer === 2 ? .19 : .07)) * readingMask + particle.excitement * .5);
      const color = particle.warm ? "#d9c497" : "#d4e3fa";
      if (particle.layer === 2) {
        const glow = context.createRadialGradient(x, y, 0, x, y, particle.radius * 5);
        glow.addColorStop(0, color);
        glow.addColorStop(1, "transparent");
        context.globalAlpha = alpha * .22;
        context.fillStyle = glow;
        context.fillRect(x - particle.radius * 5, y - particle.radius * 5, particle.radius * 10, particle.radius * 10);
      }
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, particle.radius + particle.excitement * .65, 0, Math.PI * 2);
      context.fill();
    }
    // A few short connections read as a constellation rather than a dense mesh.
    const nearby = points.filter(point => point.excitement > .04)
      .sort((a, b) => b.excitement - a.excitement).slice(0, 7);
    context.strokeStyle = "#cbb78a";
    context.lineWidth = .7;
    for (let i = 1; i < nearby.length; i += 1) {
      const star = nearby[i];
      let closest = null;
      let shortest = 145;
      for (let j = 0; j < i; j += 1) {
        const distance = Math.hypot(star.x - nearby[j].x, star.y - nearby[j].y);
        if (distance < shortest) { closest = nearby[j]; shortest = distance; }
      }
      if (!closest) continue;
      context.globalAlpha = Math.min(star.excitement, closest.excitement) * .48 * (1 - shortest / 180);
      context.beginPath();
      context.moveTo(star.x, star.y);
      context.lineTo(closest.x, closest.y);
      context.stroke();
    }
    drawMeteor();
    context.globalAlpha = 1;
    frameCount += 1;
  }

  function drawMeteor() {
    if (reducedMotion) return;
    if (!meteor && animationTime >= nextMeteorAt) {
      meteor = {
        start: animationTime,
        x: width * (.48 + Math.random() * .42),
        y: height * (.06 + Math.random() * .22),
        duration: 1.3 + Math.random() * .5
      };
    }
    if (!meteor) return;
    const age = animationTime - meteor.start;
    const progress = age / meteor.duration;
    if (progress >= 1) {
      meteor = null;
      nextMeteorAt = animationTime + 16 + Math.random() * 16;
      return;
    }
    const travel = Math.min(width * .4, 440);
    const x = meteor.x - travel * progress;
    const y = meteor.y + travel * .52 * progress;
    const tail = Math.min(110, travel * progress);
    if (tail < 1) return;
    const gradient = context.createLinearGradient(x, y, x + tail, y - tail * .52);
    gradient.addColorStop(0, "#e8e4d9");
    gradient.addColorStop(.18, "#b4c9e3");
    gradient.addColorStop(1, "transparent");
    context.globalAlpha = Math.sin(progress * Math.PI) * .75;
    context.strokeStyle = gradient;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + tail, y - tail * .52);
    context.stroke();
    context.fillStyle = "#f4eedf";
    context.beginPath();
    context.arc(x, y, 1.3, 0, Math.PI * 2);
    context.fill();
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
    } else if (requestId !== null) {
      window.cancelAnimationFrame(requestId);
      requestId = null;
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
    const particleCount = window.innerWidth <= 760
      ? Math.min(80, Math.max(45, Math.round(width * height / 6500)))
      : Math.min(180, Math.max(120, Math.round(width * height / 7500)));
    if (particles.length !== particleCount) {
      particles = Array.from({ length: particleCount }, makeParticle);
    }
    draw();
  }

  motionPreference.addEventListener("change", () => {
    reducedMotion = motionPreference.matches;
    syncLoop();
    syncPointer();
    if (reducedMotion) {
      meteor = null;
      nextMeteorAt = animationTime + 5 + Math.random() * 4;
      particles.forEach(particle => { particle.excitement = 0; });
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
      particles.forEach(particle => { particle.excitement = 0; });
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

  window.addEventListener("resize", resize, { passive: true });
  resize();
  canvas.parentElement.classList.add("has-canvas");
  syncPointer();
  syncButton();

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
