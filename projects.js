(() => {
  'use strict';

  const sky = document.querySelector('.sky');
  const cards = [...document.querySelectorAll('[data-project]')];
  if (!sky || !cards.length) return;

  // Each project's card and background share the same constellation geometry.
  // Shapes trace each card's artwork, so every project keeps its own silhouette:
  // an open book, a citation network, a broken orbit, a wide mesh, two checked pages.
  const maps = {
    library: {
      main: 0,
      points: [[160, 49], [160, 112], [114, 35], [68, 39], [68, 103], [114, 99], [206, 35], [252, 39], [252, 103], [206, 99], [175, 88], [200, 47], [224, 65], [244, 54]],
      edges: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 1], [0, 6], [6, 7], [7, 8], [8, 9], [9, 1], [10, 11], [11, 12], [12, 13]]
    },
    literature: {
      main: 2,
      points: [[69, 35], [69, 105], [141, 69], [215, 34], [215, 105], [253, 70]],
      edges: [[0, 2], [1, 2], [0, 1], [2, 3], [2, 4], [3, 4], [3, 5], [4, 5]]
    },
    'personal-agent': {
      main: 8,
      points: [[228, 37], [214, 72], [161, 105], [100, 118], [66, 103], [80, 68], [133, 35], [194, 22], [160, 70], [94, 46], [226, 93]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [9, 8], [8, 10]]
    },
    atlas: {
      main: 2,
      points: [[57, 86], [105, 35], [164, 65], [214, 27], [266, 71], [222, 112], [112, 111], [24, 44], [296, 30], [168, 132]],
      edges: [[7, 0], [7, 1], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2], [2, 6], [6, 0], [1, 6], [3, 5], [3, 8], [8, 4], [6, 9], [9, 5]]
    },
    skills: {
      main: 13,
      points: [[62, 30], [153, 30], [153, 110], [62, 110], [167, 30], [258, 30], [258, 110], [167, 110], [118, 95], [124, 101], [139, 84], [223, 95], [229, 101], [244, 84]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [8, 9], [9, 10], [11, 12], [12, 13]]
    }
  };
  const ns = 'http://www.w3.org/2000/svg';
  const background = document.createElementNS(ns, 'svg');
  background.setAttribute('class', 'project-sky');
  background.setAttribute('viewBox', '0 0 320 140');
  background.setAttribute('aria-hidden', 'true');
  background.setAttribute('focusable', 'false');
  sky.append(background);

  function constellation(map) {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'project-constellation');
    map.edges.forEach(([a, b], index) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M${map.points[a].join(' ')}L${map.points[b].join(' ')}`);
      path.setAttribute('pathLength', '1');
      path.style.setProperty('--trace-delay', `${index * 45}ms`);
      group.append(path);
    });
    map.points.forEach(([x, y], index) => {
      const node = document.createElementNS(ns, 'circle');
      node.setAttribute('cx', x);
      node.setAttribute('cy', y);
      node.setAttribute('r', index === map.main ? '2.2' : '1.5');
      group.append(node);
    });
    return group;
  }

  const echoes = new Map();
  cards.forEach(card => {
    const map = maps[card.dataset.project];
    if (!map) return;
    const echo = constellation(map);
    // The sky echo sits outside the card, so it borrows the card's colour.
    echo.style.setProperty('--hue', getComputedStyle(card).getPropertyValue('--hue'));
    background.append(echo);
    echoes.set(card, echo);
    const art = card.querySelector('.project-art svg');
    if (art) {
      const motif = constellation(map);
      art.append(motif);
      art.querySelectorAll('path:not(.art-orbit)').forEach(path => path.setAttribute('pathLength', '1'));
    }
  });

  // Constellation atlas: a project is collected after a moment of attention,
  // or when it is opened. Progress stays in this visitor's browser only.
  const tracker = document.querySelector('.atlas-tracker');
  const slots = tracker?.querySelector('.atlas-slots');
  const count = tracker?.querySelector('.atlas-count');
  const storageKey = 'jjydxfs-lab-atlas';
  const collected = new Set();
  try {
    JSON.parse(localStorage.getItem(storageKey) || '[]').forEach(id => { if (maps[id]) collected.add(id); });
  } catch { /* Private windows simply start a fresh atlas. */ }
  const slotFor = new Map();
  cards.forEach(card => {
    const id = card.dataset.project;
    if (!slots || !maps[id]) return;
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '30 10 260 120');
    icon.setAttribute('class', 'atlas-slot');
    icon.style.setProperty('--hue', getComputedStyle(card).getPropertyValue('--hue'));
    icon.append(constellation(maps[id]));
    slots.append(icon);
    slotFor.set(id, icon);
  });
  function renderAtlas(fresh) {
    if (!tracker) return;
    slotFor.forEach((icon, id) => icon.classList.toggle('is-collected', collected.has(id)));
    if (fresh) slotFor.get(fresh)?.classList.add('just-collected');
    const complete = collected.size === slotFor.size;
    count.textContent = `${collected.size}/${slotFor.size}`;
    tracker.classList.toggle('is-complete', complete);
    tracker.setAttribute('aria-label', complete
      ? 'Constellation atlas complete: open the hidden note'
      : `Constellation atlas: ${collected.size} of ${slotFor.size} collected`);
  }
  function collect(card) {
    const id = card.dataset.project;
    if (!maps[id] || collected.has(id)) return;
    collected.add(id);
    try { localStorage.setItem(storageKey, JSON.stringify([...collected])); } catch { /* Not saved, still shown. */ }
    renderAtlas(id);
    if (collected.size === slotFor.size) document.dispatchEvent(new CustomEvent('lab:atlas-complete'));
  }
  renderAtlas();
  tracker?.addEventListener('click', () => {
    if (collected.size === slotFor.size) document.dispatchEvent(new CustomEvent('lab:atlas-open'));
    else tracker.classList.toggle('shows-hint');
  });

  let hovered = null;
  let focused = null;
  let dwell = null;
  function sync() {
    const active = focused || hovered;
    cards.forEach(card => {
      const selected = card === active;
      card.classList.toggle('is-illuminated', selected);
      echoes.get(card)?.classList.toggle('is-lit', selected);
    });
    window.clearTimeout(dwell);
    if (active) dwell = window.setTimeout(() => collect(active), 900);
  }
  cards.forEach(card => {
    card.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      hovered = card;
      sync();
    });
    // A soft light follows the cursor across the card.
    card.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--my', `${event.clientY - bounds.top}px`);
    });
    card.addEventListener('pointerleave', () => {
      if (hovered === card) hovered = null;
      sync();
    });
    card.addEventListener('pointercancel', () => {
      if (hovered === card) hovered = null;
      sync();
    });
    card.addEventListener('focus', () => {
      focused = card.matches(':focus-visible') ? card : null;
      sync();
    });
    card.addEventListener('blur', () => { focused = null; sync(); });
    // Opening a project counts too, which is how touch visitors collect.
    card.addEventListener('click', () => collect(card));
  });
  window.addEventListener('blur', () => { hovered = null; focused = null; sync(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hovered = null; focused = null; sync(); }
  });

  // Titles in one row share the height of the tallest, so their descriptions line up;
  // a row of one-line titles keeps no empty second line.
  const titles = cards.map(card => card.querySelector('.library-copy h2')).filter(Boolean);
  function alignTitles() {
    titles.forEach(title => { title.style.minHeight = ''; });
    const rows = new Map();
    titles.forEach(title => {
      const top = Math.round(title.closest('.library-entry').offsetTop);
      rows.set(top, [...(rows.get(top) || []), title]);
    });
    rows.forEach(row => {
      const tallest = Math.max(...row.map(title => title.getBoundingClientRect().height));
      row.forEach(title => { title.style.minHeight = `${tallest}px`; });
    });
  }
  const library = document.querySelector('.library');
  // Align on the next frame, so changing heights never re-enters the observer callback.
  let aligning = null;
  const scheduleAlign = () => { if (aligning === null) aligning = requestAnimationFrame(() => { aligning = null; alignTitles(); }); };
  if (library && 'ResizeObserver' in window) new ResizeObserver(scheduleAlign).observe(library);
  document.fonts?.ready.then(alignTitles);
  alignTitles();

  // The existing global motion control also disables the tracing transitions.
  const toggle = document.getElementById('motion-toggle');
  if (toggle) {
    const syncMotion = () => document.documentElement.classList.toggle('project-motion-paused', toggle.getAttribute('aria-pressed') === 'true');
    new MutationObserver(syncMotion).observe(toggle, { attributes: true, attributeFilter: ['aria-pressed'] });
    syncMotion();
  }
})();
