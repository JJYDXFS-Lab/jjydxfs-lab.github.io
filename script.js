(() => {
  "use strict";

  const canvas = document.getElementById("starfield");
  const button = document.getElementById("motion-toggle");
  const label = document.getElementById("motion-label");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointerPreference = window.matchMedia("(min-width: 801px) and (hover: hover) and (pointer: fine)");
  const fpsCap = 25;
  const dprCap = 1.5;
  const frameInterval = 1000 / fpsCap;
  const parallaxLimit = 5;
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
    return {
      x: Math.random(),
      y: Math.random(),
      radius: .45 + Math.random() * .7,
      phase: Math.random() * Math.PI * 2,
      period: 14 + Math.random() * 12,
      opacity: .13 + Math.random() * .12,
      drift: 2 + Math.random() * 4,
      blue: Math.random() < .12
    };
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const twinkle = Math.sin(animationTime * Math.PI * 2 / particle.period + particle.phase);
      const horizontalDrift = Math.sin(animationTime * .022 + particle.phase) * particle.drift;
      const verticalDrift = Math.cos(animationTime * .017 + particle.phase) * particle.drift;
      context.globalAlpha = particle.opacity + twinkle * .045;
      context.fillStyle = particle.blue ? "#a8c7ed" : "#e1ebfa";
      context.beginPath();
      context.arc(
        12 + particle.x * Math.max(0, width - 24) + horizontalDrift + parallax.x,
        12 + particle.y * Math.max(0, height - 24) + verticalDrift + parallax.y,
        particle.radius,
        0,
        Math.PI * 2
      );
      context.fill();
    }
    context.globalAlpha = 1;
    frameCount += 1;
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
      draw();
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
    target.x = 0;
    target.y = 0;
  }

  function onPointerMove(event) {
    if (!running || event.pointerType !== "mouse") return;
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
    button.setAttribute("aria-label", reducedMotion ? "Star animation paused by your reduced motion preference" : "Pause star animation");
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
    const particleCount = window.innerWidth <= 800 ? 36 : 56;
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
