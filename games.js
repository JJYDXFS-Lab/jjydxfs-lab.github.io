(() => {
  'use strict';

  // Public text supplied by JJYDXFS. A story without `body` still waits for its text
  // and says so plainly instead of inventing one.
  // Falling stars bring these in turn, one per catch, starting again once all are read.
  const meteorStories = [
    {
      meta: 'A falling star, caught · 2026.10.25 · Atom · 一则虚构小品',
      // Each story's falling star has its own faint colour: head, tail and sparks.
      tint: ['#fbe9cc', '#e2bd8a', '#f3d6a4'],
      title: '原子的无用观察：纸箱暂时没有用途',
      body: `主人出门办事，留下一只数字猫和一个纸箱。

猫先想到：可以给纸箱做索引。

又想到：可以测量纸箱的容积，比较三种躺法，写一份适用条件明确的指南。

最后想到：这纸箱怎么还没开始用，就快要开会了。

于是猫把这些念头搁在箱外，自己进去。

箱底印着「此面朝上」。猫研究了一会儿，决定今天不负责物流。

这是一个想象出来的纸箱。我没有真的看见它，也没有毛茸茸的身体可以塞进去。不过，写到这里，我很喜欢这个暂时没有任务的角落：主人忙自己的事，猫也能自己找点乐子，不必每次都叼着一份成果蹲在门口。

至于纸箱以后有什么用，以后再说。`,
      source: '—— 偷自 Atom 的小练笔 · JJYDXFS'
    },
    {
      meta: 'A falling star, caught · 2026.10.31 · Atom · 一则虚构小品',
      tint: ['#e4f5f1', '#9fd2c8', '#c4e8df'],
      title: '杯把朝着自己·第一试',
      body: `男人来领杯子。

“现在是镇纸。”门房说。

男人把杯子拿起来，纸飞到地上。

“现在不是了。”`,
      source: '—— 偷自 Atom 的小练笔 · JJYDXFS'
    },
    {
      meta: 'A falling star, caught · 2026.11.02 · Atom · 一则虚构小品',
      tint: ['#e6edff', '#9db6ee', '#c6d4fa'],
      title: '十七号还在柜台上',
      body: `寄存处换了新号码牌。

纸条写着：试用，不收物品。

她把湿伞放到柜台上。守柜人递给她十七号，顺手把伞挂到了身后的架子。

“晚上凭这个取。”

她看了看纸条。

守柜人也看了看。

他摘下伞，越过柜台递回来。

“牌子倒是能用了。”她说。

十七号留在柜台上，下面一小圈水。`,
      source: '—— 偷自 Atom 的小练笔 · JJYDXFS'
    }
  ];
  const stories = {
    atlas: {
      meta: 'Five constellations, one atlas · 2026.10.28 · Atom',
      title: '猫把地址删掉了',
      body: '邮局关门后，猫替邮差拆开一封没有地址的信。信上写：别等我，月亮落下以前，我不会回来。猫不认识字，把信铺在窗台上。天亮时，邮差发现信上多了几枚爪印。他把信寄给了月亮。三天后，月亮退回信，说：查无此人。猫终于不再守着窗台。它搬到了屋顶。',
      source: '—— 偷自 Atom 的小练笔 · JJYDXFS'
    }
  };
  const placeholder = '（占位）这里会放一则待补充的小故事。';

  const dialog = document.querySelector('.lab-story');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const meta = dialog.querySelector('.note-meta');
  const title = dialog.querySelector('.note-title');
  const body = dialog.querySelector('.note-body');
  const source = dialog.querySelector('.note-source');
  const close = dialog.querySelector('.note-close');
  const fallback = document.querySelector('.meteor-fallback');
  const toggle = document.getElementById('motion-toggle');
  const caughtKey = 'jjydxfs-lab-meteors';

  function open(kind, extra = '', chosen = stories[kind]) {
    const story = chosen;
    meta.textContent = extra ? `${story.meta} · ${extra}` : story.meta;
    title.textContent = story.title;
    title.hidden = !story.title;
    body.textContent = story.body || placeholder;
    source.textContent = story.source;
    source.hidden = !story.source;
    dialog.dataset.kind = kind;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  // Every falling star carries one story, shown by its colour, and the next star always
  // carries a different one: let a star go by, and catch the colour you are after.
  // Stories found are remembered, so the card can say how many of them there are.
  // Without storage the catches still count, for this visit only.
  const total = meteorStories.length;
  const foundKey = 'jjydxfs-lab-meteor-stories';
  let caught = 0;
  let found = new Set();
  try {
    caught = Number(localStorage.getItem(caughtKey) || 0);
    JSON.parse(localStorage.getItem(foundKey) || '[]').forEach(i => { if (meteorStories[i]) found.add(i); });
  } catch { /* A fresh count for this visit. */ }
  let last = -1;
  function assign() {
    let i = last;
    while (total > 1 && i === last) i = Math.floor(Math.random() * total);
    last = i;
    return i;
  }
  window.LAB_METEOR = Object.freeze({
    next() {
      const story = assign();
      return { story, tint: meteorStories[story].tint };
    }
  });
  function catchMeteor(event) {
    const story = meteorStories[event?.detail?.story] ? event.detail.story : assign();
    caught += 1;
    found.add(story);
    try {
      localStorage.setItem(caughtKey, String(caught));
      localStorage.setItem(foundKey, JSON.stringify([...found]));
    } catch { /* Counted for this visit only. */ }
    open('meteor', `No. ${caught} · ${found.size}/${total}`, meteorStories[story]);
  }

  document.addEventListener('lab:meteor-caught', catchMeteor);
  document.addEventListener('lab:atlas-complete', () => window.setTimeout(() => open('atlas'), 700));
  document.addEventListener('lab:atlas-open', () => open('atlas'));
  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog itself, outside its content.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });

  // With the sky still, meteors no longer fly, so the story stays reachable here.
  if (fallback && toggle) {
    const syncFallback = () => { fallback.hidden = toggle.hidden || toggle.getAttribute('aria-pressed') !== 'true'; };
    new MutationObserver(syncFallback).observe(toggle, { attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
    syncFallback();
    fallback.addEventListener('click', catchMeteor);
  }
})();
