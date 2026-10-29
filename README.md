# JJYDXFS Lab homepage

Static source for the JJYDXFS Lab organization homepage.

- Public site: <https://jjydxfs-lab.github.io/>
- Organization: <https://github.com/JJYDXFS-Lab/>
- Projects:
  - [Library of the Citadel](https://jjydxfs-lab.github.io/library-of-the-citadel/)
  - [Human–Agent Collaboration in Data Science](https://jjydxfs-lab.github.io/awesome-human-agent-collaboration-in-data-science/)
  - [Living with a Personal Agent](https://jjydxfs.github.io/atom-reading-group-2026/)
  - [Agent Atlas](https://jjydxfs-lab.github.io/agent-atlas/)
  - [Academic Skills](https://github.com/JJYDXFS-Lab/academic-skills)

The site is plain HTML, CSS, and JavaScript and requires no build step.

## The sky

The background is the real night sky above one place, computed for the visitor's current moment: naked-eye stars, the Milky Way, constellations that name themselves near the cursor, and a sky that warms at twilight. A few small games live in it too.

To move the sky, edit only [`sky-place.js`](sky-place.js):

```js
window.LAB_SKY_PLACE = {
  name: "Canberra",
  lat: -35.2809,            // south is negative
  lon: 149.13,              // west is negative
  timeZone: "Australia/Sydney"
};
```

Star, constellation and name data in [`sky-data.js`](sky-data.js) is derived from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, used under the BSD 3-Clause licence.

## Local preview

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>.

© 2026 [JJYDXFS](https://jjydxfs.github.io/) & [Atom (原子)](https://atom-of-jjydxfs.github.io/). All rights reserved.
