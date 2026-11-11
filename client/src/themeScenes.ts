import type { TableTheme } from "@tabletop-judge/shared";

// Drawn "image" scenes, not photos - real illustrations built from SVG
// primitives (plus, for Synthwave, a genuine CSS 3D floor - see
// SYNTH_GRID_FLOOR_HTML below) so each stays accent-reactive, which a
// static raster image couldn't do. Ported near-verbatim from the design
// mockup (docs/mockups/theme-ambient-backgrounds.html) where every scene
// and its animation were tuned and screenshot-verified before landing
// here - see that file's history for the reasoning behind each choice
// (why the horizon sits high, why the palm is rooted at the bottom edge,
// why the grid floor uses perspective()/rotateX() instead of animating
// SVG line positions, etc). Rendered via dangerouslySetInnerHTML in
// ThemeScene.tsx - safe here because every input is either a fixed string
// literal in this file or `accent`, always one of a closed set of hex
// values from TABLE_THEME_ACCENTS, never free user input.

// Fixed-seed pseudo-random source for scattered elements (cork flecks,
// glow motes) - deterministic so positions stay put across re-renders
// instead of jittering to new spots every accent swap, the way
// Math.random() would.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// A soft irregular closed blob outline around (cx,cy) - n points at
// baseR +/- variance, connected with quadratic curves through each
// point's midpoint to its neighbor so the outline reads as organic
// rather than a jagged polygon. Used by Felt & Ink's ink bloom.
function blobPath(cx: number, cy: number, baseR: number, n: number, rand: () => number, variance: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const r = baseR * (1 - variance / 2 + rand() * variance);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  const mid0: [number, number] = [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2];
  let d = `M ${mid0[0].toFixed(1)} ${mid0[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const mid = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
    d += ` Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)}, ${mid[0].toFixed(1)} ${mid[1].toFixed(1)}`;
  }
  return d + " Z";
}

function synthwaveSunset(accent: string): string {
  const bg = "#150a2e",
    mid = "#7b1fa2",
    warm = "#ff8a3d",
    dark = "#0d0619";
  // horizonY sits high (not screen-center) deliberately: the real stage
  // layout stacks header -> black card -> judging grid down the middle,
  // so a classic dead-center sun would be fully hidden behind opaque UI.
  const w = 1000,
    h = 625,
    horizonY = 200;
  const sunCx = 500,
    sunR = 118,
    sunCy = horizonY - 30;
  const stars: [number, number, number, number][] = [
    [70, 40, 1.6, 0.8], [140, 70, 1.1, 0.5], [230, 25, 1.8, 0.7], [330, 55, 1.2, 0.6],
    [430, 20, 1.4, 0.9], [560, 45, 1.1, 0.5], [640, 15, 1.7, 0.7], [760, 60, 1.3, 0.6],
    [860, 30, 1.6, 0.8], [930, 70, 1.1, 0.5], [40, 90, 1.2, 0.4], [970, 90, 1.3, 0.5],
  ];
  const starsMarkup = stars.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${warm}" opacity="${o}"/>`).join("");
  const stripeFracs: [number, number][] = [[0.06, 0.06], [0.24, 0.08], [0.44, 0.1], [0.66, 0.13], [0.9, 0.16]];
  const stripeRects = stripeFracs
    .map(
      ([yf, hf]) =>
        `<rect x="${sunCx - sunR * 0.85}" y="${(sunCy + sunR * yf).toFixed(1)}" width="${sunR * 1.7}" height="${(sunR * hf).toFixed(1)}" fill="${bg}"/>`
    )
    .join("");
  const mtn = [
    [0, 0], [60, -18], [120, 0], [190, -40], [260, 0], [340, -14], [420, 0], [500, -55],
    [560, 0], [640, -22], [720, 0], [800, -36], [880, 0], [940, -16], [1000, 0],
  ]
    .map(([dx, dy]) => `${dx},${horizonY + dy}`)
    .join(" ");
  const svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg}"/><stop offset="60%" stop-color="${mid}"/><stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${warm}"/><stop offset="100%" stop-color="${bg}"/>
      </linearGradient>
      <clipPath id="sunClip"><circle cx="${sunCx}" cy="${sunCy}" r="${sunR}"/></clipPath>
    </defs>
    <rect x="0" y="0" width="${w}" height="${horizonY}" fill="url(#sky)"/>
    <rect x="0" y="${horizonY}" width="${w}" height="${h - horizonY}" fill="url(#ground)"/>
    ${starsMarkup}
    <g clip-path="url(#sunClip)">
      <circle cx="${sunCx}" cy="${sunCy}" r="${sunR}" fill="${accent}"/>
      ${stripeRects}
    </g>
    <polygon points="${mtn} 1000,${h} 0,${h}" fill="${dark}" opacity="0.88"/>
    <line class="horizon-glow" x1="0" y1="${horizonY}" x2="${w}" y2="${horizonY}" stroke="${accent}" stroke-width="3" opacity="0.9"/>
  </svg>`;
  // The classic "flying down an infinite grid toward the horizon" look is
  // a genuine CSS 3D effect (see .synth-grid-floor in index.css), not
  // something hand-faked SVG line positions can pull off.
  const gridFloor = `<div class="synth-grid-floor"><div class="plane" style="--grid-color:${accent};"></div></div>`;
  return svg + gridFloor;
}

function feltInkBloom(accent: string): string {
  const rand = seeded(7);
  const w = 1000,
    h = 625;
  const main = blobPath(830, 560, 210, 9, rand, 0.4);
  const drop1 = blobPath(150, 90, 46, 7, seeded(11), 0.4);
  const drop2 = blobPath(230, 150, 26, 7, seeded(13), 0.4);
  const ripples = [260, 320, 385]
    .map((r, i) => {
      const o = (0.2 - i * 0.05).toFixed(2);
      return `<circle class="ripple" cx="830" cy="560" r="${r}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="${o}" style="--ripple-o:${o}; animation-duration:4s; animation-delay:${i * -1.3}s;"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <path d="${main}" fill="${accent}" opacity="0.16"/>
    <path d="${drop1}" fill="${accent}" opacity="0.12"/>
    <path d="${drop2}" fill="${accent}" opacity="0.10"/>
    ${ripples}
  </svg>`;
}

function bulletinCorkboard(accent: string): string {
  const rand = seeded(21);
  const w = 1000,
    h = 625;
  const flecks = Array.from({ length: 55 }, () => {
    const x = (rand() * w).toFixed(1),
      y = (rand() * h).toFixed(1);
    const r = (0.8 + rand() * 1.6).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a6a45" opacity="${(0.12 + rand() * 0.14).toFixed(2)}"/>`;
  }).join("");
  function pin(x: number, y: number, rot: number, scale: number, delay: number): string {
    return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})">
      <polygon points="-46,-6 46,-14 40,54 -40,46" fill="#efe6d8" opacity="0.9"/>
      <polygon points="-46,-6 -30,10 -40,46" fill="#00000022"/>
      <circle cx="0" cy="18" r="8" fill="${accent}"/>
      <circle class="twinkle" cx="-2.5" cy="15.5" r="2.4" fill="#ffffff" opacity="0.8" style="--flicker-lo:0.3; --flicker-hi:0.95; animation-duration:2.6s; animation-delay:${delay}s;"/>
    </g>`;
  }
  const scanline = `<rect class="scanline" x="0" y="-30" width="${w}" height="30" fill="${accent}" style="opacity:0.12"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${flecks}
    ${scanline}
    ${pin(430, 26, -6, 0.42, 0)}
    ${pin(700, 32, 8, 0.42, -1.4)}
  </svg>`;
}

function neonBlackLightPoster(accent: string): string {
  const rand = seeded(33);
  const w = 1000,
    h = 625;
  const bolt = "M 830,40 L 770,150 L 815,150 L 760,270 L 870,120 L 822,120 Z";
  const flecks = Array.from({ length: 16 }, () => {
    const x = (rand() * w).toFixed(1),
      y = (rand() * (h * 0.75)).toFixed(1);
    const r = (1.2 + rand() * 2.2).toFixed(1);
    const o = (0.25 + rand() * 0.4).toFixed(2);
    const dur = (1.6 + rand() * 2.2).toFixed(2),
      delay = (rand() * -3).toFixed(2);
    return `<circle class="twinkle" cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="${o}" style="--flicker-lo:${(Number(o) * 0.3).toFixed(2)}; --flicker-hi:${o}; animation-duration:${dur}s; animation-delay:${delay}s;"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="neonBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter></defs>
    ${flecks}
    <g class="neon-flicker">
      <path d="${bolt}" fill="none" stroke="${accent}" stroke-width="10" opacity="0.45" filter="url(#neonBlur)"/>
      <path d="${bolt}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.95"/>
    </g>
  </svg>`;
}

function siteWarehouse(accent: string): string {
  const w = 1000,
    h = 625;
  const trussPts: string[] = [];
  for (let x = 0; x <= w; x += 60) trussPts.push(`${x},${x % 120 === 0 ? 26 : 58}`);
  function fixture(x: number, delay: number): string {
    return `<g class="fixture-sway" style="transform-origin:${x}px 58px; animation-delay:${delay}s;">
      <line x1="${x}" y1="58" x2="${x}" y2="120" stroke="#3a3a3a" stroke-width="2"/>
      <polygon points="${x - 20},120 ${x + 20},120 ${x + 10},146 ${x - 10},146" fill="#1c1c1c" stroke="#444" stroke-width="1"/>
      <polygon points="${x - 10},146 ${x + 10},146 ${x + 110},430 ${x - 110},430" fill="${accent}" opacity="0.14"/>
    </g>`;
  }
  const stripeH = 34;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="hazard" width="36" height="36" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="36" height="36" fill="#0d0d0e"/>
        <rect width="18" height="36" fill="${accent}" opacity="0.5"/>
      </pattern>
    </defs>
    <line x1="0" y1="26" x2="${w}" y2="26" stroke="#3a3a3a" stroke-width="2"/>
    <polyline points="${trussPts.join(" ")}" fill="none" stroke="#3a3a3a" stroke-width="2"/>
    ${fixture(260, 0)}${fixture(740, -1.6)}
    <rect x="0" y="${h - stripeH}" width="${w}" height="${stripeH}" fill="url(#hazard)"/>
  </svg>`;
}

function technoLaserRig(accent: string): string {
  const rand = seeded(64);
  const w = 1000,
    h = 625;
  const originX = 500,
    originY = -20;
  const beams = [-70, -50, -30, -12, 5, 22, 40, 60, 80]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180,
        len = 340;
      const ex = originX + Math.sin(rad) * len,
        ey = originY + Math.cos(rad) * len;
      return `<line x1="${originX}" y1="${originY}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${accent}" stroke-width="2" opacity="0.22"/>`;
    })
    .join("");
  const flecks = Array.from({ length: 14 }, () => {
    const x = (rand() * w).toFixed(1),
      y = (rand() * h * 0.7).toFixed(1);
    const o = (0.3 + rand() * 0.4).toFixed(2);
    const dur = (0.4 + rand() * 0.6).toFixed(2),
      delay = (rand() * -1.5).toFixed(2);
    return `<circle class="strobe-fleck" cx="${x}" cy="${y}" r="${(1 + rand() * 2).toFixed(1)}" fill="${accent}" opacity="${o}" style="--flicker-lo:${(Number(o) * 0.15).toFixed(2)}; --flicker-hi:${o}; animation-duration:${dur}s; animation-delay:${delay}s;"/>`;
  }).join("");
  const trace = `<g stroke="${accent}" stroke-width="2" fill="none" opacity="0.55">
    <path d="M 380,28 h 60 v 16 h 40"/>
    <circle cx="380" cy="28" r="3" fill="${accent}" stroke="none"/>
    <circle cx="480" cy="44" r="3" fill="${accent}" stroke="none"/>
    <path d="M 640,40 h -50 v -14 h -30"/>
    <circle cx="640" cy="40" r="3" fill="${accent}" stroke="none"/>
    <circle cx="560" cy="26" r="3" fill="${accent}" stroke="none"/>
  </g>`;
  const barCount = 26,
    barW = w / barCount;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const t = i / barCount;
    const bh = 14 + Math.abs(Math.sin(t * Math.PI * 3.2 + 0.6)) * 46 + rand() * 10;
    const dur = (0.5 + rand() * 0.7).toFixed(2);
    const delay = (rand() * -1.2).toFixed(2);
    const minScale = (0.25 + rand() * 0.25).toFixed(2);
    return `<rect class="eq-bar" x="${(i * barW + barW * 0.15).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(barW * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" fill="${accent}" opacity="0.4" style="--eq-min:${minScale}; animation-duration:${dur}s; animation-delay:${delay}s;"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${flecks}
    <g class="laser-fan" style="transform-origin:${originX}px ${originY}px;">${beams}</g>
    ${trace}
    ${bars}
  </svg>`;
}

function beachOceanSunset(accent: string): string {
  const w = 1000,
    h = 625,
    horizonY = 200;
  const waveHLines = [horizonY + 40, horizonY + 90, horizonY + 150]
    .map((y, i) => {
      const dur = (5 + i * 1.4).toFixed(1);
      return `<path class="wave-scroll" d="M -250,${y} Q -125,${y - 10} 0,${y} T 250,${y} T 500,${y} T 750,${y} T 1000,${y} T 1250,${y}" fill="none" stroke="${accent}" stroke-width="2" opacity="${(0.3 - i * 0.07).toFixed(2)}" style="animation-duration:${dur}s;"/>`;
    })
    .join("");
  const baseX = 45,
    baseY = h - 3,
    tipX = 34,
    tipY = baseY - 58;
  const trunk = `<path d="M ${baseX},${baseY + 6} Q ${baseX - 10},${baseY - 30} ${tipX},${tipY}" fill="none" stroke="#2b2118" stroke-width="7" stroke-linecap="round"/>`;
  const frondFan = [-160, -125, -90, -55, -25]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180,
        len = 40,
        midLen = len * 0.55;
      const ex = tipX + Math.cos(rad) * len,
        ey = tipY + Math.sin(rad) * len;
      const mx = tipX + Math.cos(rad) * midLen + 9,
        my = tipY + Math.sin(rad) * midLen - 4;
      return `<path d="M ${tipX},${tipY} Q ${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="#2b2118" stroke-width="6" stroke-linecap="round"/>`;
    })
    .join("");
  const palm = trunk + frondFan;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="beachSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff3d6"/><stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${horizonY + 60}" fill="url(#beachSky)"/>
    <circle cx="500" cy="${horizonY - 10}" r="85" fill="${accent}" opacity="0.85"/>
    ${waveHLines}
    ${palm}
  </svg>`;
}

function windwardHarbor(accent: string): string {
  const w = 1000,
    h = 625,
    horizonY = 230;
  const waveLayer = (className: string, y: number, fill: string, amp: number) => {
    const seg = 100;
    let d = `M -100,${y}`;
    for (let x = -100; x <= w + 200; x += seg) {
      d += ` Q ${x + seg / 2},${y - amp} ${x + seg},${y}`;
    }
    d += ` V ${h} H -100 Z`;
    return `<path class="${className}" d="${d}" fill="${fill}"/>`;
  };
  const lighthouseX = 830,
    lighthouseBaseY = h - 195;
  const lighthouse = `<g transform="translate(${lighthouseX},${lighthouseBaseY})">
    <rect x="-8" y="-140" width="16" height="140" fill="#1c3b52"/>
    <polygon points="-16,-140 16,-140 10,-165 -10,-165" fill="${accent}" opacity="0.9"/>
    <rect x="-13" y="-118" width="26" height="9" fill="${accent}" opacity="0.55"/>
    <rect x="-13" y="-90" width="26" height="9" fill="${accent}" opacity="0.55"/>
    <g class="beam-sweep" style="transform-origin:${lighthouseX}px ${lighthouseBaseY - 158}px;">
      <polygon points="0,-158 520,-300 520,-235" fill="${accent}" opacity="0.16"/>
    </g>
  </g>`;
  const gulls = [
    [260, 130, 1, 0],
    [430, 175, 0.8, -1.4],
    [190, 220, 0.65, -3.1],
  ]
    .map(([x, y, s, delay]) => {
      const gw = 24 * (s as number);
      return `<path class="gull-bob" style="animation-delay:${delay}s;" d="M ${x} ${y} q ${gw / 2} ${-gw / 2} ${gw} 0 q ${gw / 2} ${-gw / 2} ${gw} 0" fill="none" stroke="${"#ecdfc0"}" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>`;
    })
    .join("");
  const ship = `<g transform="translate(560,${horizonY + 68})" opacity="0.55" fill="#050d15">
    <path d="M -70 40 L 70 40 L 55 60 L -55 60 Z"/>
    <rect x="-4" y="-90" width="6" height="130"/>
    <rect x="30" y="-70" width="6" height="110"/>
    <path d="M 2 -88 L 2 -30 L 44 -30 Z" opacity="0.9"/>
    <path d="M -2 -70 L -2 -20 L -40 -20 Z" opacity="0.9"/>
  </g>`;
  const wheel = `<g class="wheel-turn" transform="translate(905,120)" opacity="0.1" stroke="${accent}" stroke-width="5" fill="none">
    <circle r="95"/>
    <circle r="62"/>
    <circle r="9" fill="${accent}"/>
    <g stroke-linecap="round">
      <line x1="0" y1="-40" x2="0" y2="-108"/>
      <line x1="0" y1="40" x2="0" y2="108"/>
      <line x1="-40" y1="0" x2="-108" y2="0"/>
      <line x1="40" y1="0" x2="108" y2="0"/>
      <line x1="28" y1="-28" x2="76" y2="-76"/>
      <line x1="-28" y1="28" x2="-76" y2="76"/>
      <line x1="-28" y1="-28" x2="-76" y2="-76"/>
      <line x1="28" y1="28" x2="76" y2="76"/>
    </g>
  </g>`;
  const waves =
    waveLayer("wave-scroll", horizonY + 110, "#0f2637", 20) +
    waveLayer("wave-scroll", horizonY + 175, "#0b1f2e", 25) +
    waveLayer("wave-scroll", horizonY + 250, "#050d15", 22);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="windwardSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#16344a"/><stop offset="100%" stop-color="#0a1b28"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${horizonY + 90}" fill="url(#windwardSky)"/>
    <circle cx="850" cy="90" r="34" fill="${accent}" opacity="0.75"/>
    ${gulls}
    ${wheel}
    ${ship}
    ${lighthouse}
    ${waves}
  </svg>`;
}

function parlourLampRoom(accent: string): string {
  const w = 1000,
    h = 625;
  const lamp = `<g transform="translate(70,20)">
    <ellipse cx="0" cy="95" rx="14" ry="4" fill="#0f0b07"/>
    <line x1="0" y1="20" x2="0" y2="95" stroke="#0f0b07" stroke-width="4"/>
    <polygon points="-38,20 38,20 24,-14 -24,-14" fill="#0f0b07"/>
    <polygon class="lamp-flicker" points="-24,-14 24,-14 60,120 -60,120" fill="${accent}" opacity="0.16"/>
  </g>`;
  const rand = seeded(51);
  const curtains = Array.from({ length: 5 }, (_, i) => {
    const x = w - 30 - i * 26;
    const amp = 10 + rand() * 6;
    return `<path d="M ${x},0 Q ${x - amp},${h / 2} ${x},${h}" fill="none" stroke="#0f0b07" stroke-width="10" opacity="0.5"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${curtains}
    ${lamp}
  </svg>`;
}

const SCENE_BUILDERS: Record<TableTheme, (accent: string) => string> = {
  felt: feltInkBloom,
  bulletin: bulletinCorkboard,
  neon: neonBlackLightPoster,
  site: siteWarehouse,
  techno: technoLaserRig,
  beach: beachOceanSunset,
  parlour: parlourLampRoom,
  synthwave: synthwaveSunset,
  windward: windwardHarbor,
};

/** Builds the drawn-scene HTML/SVG markup for a theme at a given accent
 * color. Deterministic (fixed-seed scatter, no Math.random) so it's stable
 * across re-renders. Intended for dangerouslySetInnerHTML - see the
 * module comment above for why that's safe here. */
export function renderThemeScene(theme: TableTheme, accent: string): string {
  return SCENE_BUILDERS[theme](accent);
}
