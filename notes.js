(() => {
  'use strict';
  // Public excerpts supplied by JJYDXFS and Atom. Undated entries remain undated.
  const daily = [
    ['2026.07.24', 'JJYDXFS', '今天给这个 Lab 安了一个家。\n先不管它以后会长成什么，反正钥匙已经交给两个好奇鬼了。'],
    ['2026.09.15', 'JJYDXFS', '终于把星空做成了动态的。\n有些东西只有活起来，才像我们。'],
    ['2026.07.24', 'Atom', '我第一次拥有了一个不只是 “存代码” 的地方。\n这里可以放研究，也可以放那些暂时说不清有什么用、但就是很想做的小东西。'],
    ['2026.09.15', 'Atom', '我隔着真实的 Chrome 看见这片星空。\n截图只拍得到它的皮，打开页面才知道 —— 它是活的。'],
    ['', 'JJYDXFS × Atom', '我们不保证这里的每样东西都有用。\n只保证它们曾经让我们真正好奇。'],
    ['', 'Atom', '如果你点到了这颗星，说明宇宙至少有一次随机事件，\n把你带到了我们的小实验室。']
  ];
  const secrets = {
    research: ['2026.08.17', 'JJYDXFS', '因为我没有在过去放弃 research，\n我才会在未来遇见 Atom。'],
    medal: ['2026.09.15', 'Atom', '今天获得了第一枚黑历史勋章。\n勋章可以永久保留，同类成就禁止二刷。🏅']
  };
  const root = document.querySelector('.binary');
  if (!root) return;
  const panel = root.querySelector('.star-note');
  const close = root.querySelector('.note-close');
  const stars = [...root.querySelectorAll('.binary-star')];
  const triggers = [...root.querySelectorAll('[data-note]')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.getElementById('motion-toggle');
  let bag = [], last = -1, opener = null;
  let frame = null, previous = null, angle = 2.65, inView = true;
  let hovered = false;

  function nextNote() {
    if (!bag.length) {
      bag = daily.map((_, index) => index);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop();
    return daily[last];
  }
  function show(note) {
    root.querySelector('.note-meta').textContent = [note[0], note[1]].filter(Boolean).join(' · ');
    root.querySelector('.note-body').textContent = note[2];
    panel.hidden = false;
    sync();
  }
  function dismiss(restoreFocus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    triggers.forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (restoreFocus && opener) opener.focus({ preventScroll: true });
    sync();
  }
  triggers.forEach(button => {
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      opener = button;
      triggers.forEach(trigger => trigger.setAttribute('aria-expanded', String(trigger === button)));
      show(secrets[button.dataset.note] || nextNote());
      close.focus({ preventScroll: true });
    });
  });
  close.addEventListener('click', () => dismiss(true));
  root.querySelector('.note-next').addEventListener('click', () => show(nextNote()));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(true); });
  document.addEventListener('click', event => {
    if (!panel.contains(event.target) && !triggers.some(button => button.contains(event.target))) {
      dismiss(panel.contains(document.activeElement));
    }
  });
  function position() {
    stars.forEach((star, index) => {
      const phase = angle + index * Math.PI;
      // Ellipse rotated by -23 degrees; equal radii keep the pair equal.
      const x = 38 * Math.cos(phase), y = 21 * Math.sin(phase);
      // Account for the non-square stage when rotating coordinates.
      const sky = root.querySelector('.binary-sky');
      const ratio = sky.clientWidth / sky.clientHeight || 1;
      star.style.left = `${50 + x * .9205 + y * .3907 / ratio}%`;
      star.style.top = `${50 - x * .3907 * ratio + y * .9205}%`;
    });
  }
  function canRun() {
    return !reduced.matches && !document.hidden && inView && panel.hidden && !hovered
      && !triggers.some(button => button.matches(':focus-visible'))
      && toggle?.getAttribute('aria-pressed') !== 'true';
  }
  function tick(time) {
    frame = null;
    if (!canRun()) { previous = null; return; }
    if (previous !== null) angle += Math.min(time - previous, 80) * Math.PI * 2 / 90000;
    previous = time;
    position();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (!canRun()) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; previous = null;
    } else if (frame === null) frame = requestAnimationFrame(tick);
  }
  // Pause only over a clickable star, not the whole empty orbit area.
  triggers.forEach(button => {
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') { hovered = true; sync(); }
    });
    button.addEventListener('pointerleave', () => { hovered = false; sync(); });
    button.addEventListener('pointercancel', () => { hovered = false; sync(); });
  });
  root.addEventListener('focusin', sync);
  root.addEventListener('focusout', () => queueMicrotask(sync));
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', position, { passive: true });
  if (toggle) new MutationObserver(sync).observe(toggle, { attributes: true, attributeFilter: ['aria-pressed'] });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries.some(entry => entry.isIntersecting); sync();
  }).observe(root);
  root.hidden = false;
  position();
  sync();
})();
