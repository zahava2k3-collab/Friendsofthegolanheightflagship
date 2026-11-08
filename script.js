const OPEN_MS = 30000;
const RULE_BAND = 10;
const RULE_AMP = 0.7;
const FRAME_AMP = 0.82;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function elementSeed(el) {
  if (!el.dataset.strokeSeed) {
    elementSeed.n = (elementSeed.n || 1) + 1;
    el.dataset.strokeSeed = String(elementSeed.n * 9973);
  }
  return Number(el.dataset.strokeSeed);
}

function organicOffset(length, seed, amp) {
  const rng = mulberry32(seed);
  const spacing = 1.5;
  const samples = Math.max(8, Math.round(length / spacing));
  const ripple = new Array(samples + 1);
  for (let i = 0; i <= samples; i++) ripple[i] = rng() * 2 - 1;
  for (let pass = 0; pass < 2; pass++) {
    const next = ripple.slice();
    for (let i = 1; i < samples; i++) {
      next[i] = ripple[i - 1] * 0.25 + ripple[i] * 0.5 + ripple[i + 1] * 0.25;
    }
    for (let i = 1; i < samples; i++) ripple[i] = next[i];
  }
  const softer = ripple.slice();
  for (let i = 1; i < samples; i++) {
    softer[i] = ripple[i - 1] * 0.25 + ripple[i] * 0.5 + ripple[i + 1] * 0.25;
  }
  for (let i = 1; i < samples; i++) ripple[i] = ripple[i] * 0.85 + softer[i] * 0.15;

  let peak = 0.0001;
  for (let i = 1; i < samples; i++) peak = Math.max(peak, Math.abs(ripple[i]));
  const phase = rng() * Math.PI * 2;
  const period = 13;
  const blended = new Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const distance = (length * i) / samples;
    const wave = Math.sin((distance / period) * Math.PI * 2 + phase);
    blended[i] = (ripple[i] / peak) * 0.7 + wave * 0.3;
  }
  let blendPeak = 0.0001;
  for (let i = 1; i < samples; i++) blendPeak = Math.max(blendPeak, Math.abs(blended[i]));
  const values = new Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const distance = (length * i) / samples;
    const fade = Math.min(1, distance / 8, (length - distance) / 8);
    values[i] = (blended[i] / blendPeak) * amp * fade;
  }
  values[0] = 0;
  values[samples] = 0;

  return function at(distance) {
    if (distance <= 0 || distance >= length) return 0;
    const f = (distance / length) * samples;
    const index = Math.min(samples - 1, Math.floor(f));
    const t = f - index;
    const s = t * t * (3 - 2 * t);
    return values[index] + (values[index + 1] - values[index]) * s;
  };
}

function curveThrough(points, move) {
  const count = points.length;
  if (!count) return "";
  const fmt = (point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
  let path = move ? `M${fmt(points[0])}` : "";
  if (count === 1) return path;
  if (count === 2) return `${path}L${fmt(points[1])}`;
  const at = (index) => points[Math.max(0, Math.min(count - 1, index))];
  for (let i = 0; i < count - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += `C${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
  }
  return path;
}

function strokePath(length, across, seed, amp, horizontal) {
  const at = organicOffset(Math.max(length, 1), seed, amp);
  const step = 4;
  const points = [];
  for (let distance = 0; distance <= length + 0.01; distance += step) {
    const along = Math.min(length, distance);
    const offset = across + at(along);
    points.push(horizontal ? [along, offset] : [offset, along]);
  }
  const last = points[points.length - 1];
  const endAlong = horizontal ? last[0] : last[1];
  if (Math.abs(endAlong - length) > 0.05) {
    const end = across + at(length);
    points.push(horizontal ? [length, end] : [end, length]);
  }
  return curveThrough(points, true);
}

function framePath(width, height, seed) {
  const inset = 2.5;
  const corners = [
    [inset, inset],
    [width - inset, inset],
    [width - inset, height - inset],
    [inset, height - inset]
  ];
  let path = "";

  for (let edge = 0; edge < 4; edge += 1) {
    const start = corners[edge];
    const end = corners[(edge + 1) % 4];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const at = organicOffset(length, seed + (edge + 1) * 4099, FRAME_AMP);
    const points = [];
    for (let distance = 0; distance <= length; distance += 4) {
      const along = Math.min(length, distance);
      const offset = at(along);
      points.push([
        start[0] + (dx / length) * along + nx * offset,
        start[1] + (dy / length) * along + ny * offset
      ]);
    }
    const last = points[points.length - 1];
    if (Math.hypot(last[0] - end[0], last[1] - end[1]) > 0.05) points.push([end[0], end[1]]);
    path += curveThrough(points, edge === 0);
  }

  return path + "Z";
}

function svgMask(width, height, path) {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none"><path d="${path}" stroke="#000" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function drawFrame(box) {
  const svg = box.querySelector(".wiggle-stroke");
  if (!svg) return;
  const width = box.clientWidth;
  const height = box.clientHeight;
  if (width < 2 || height < 2) return;
  const key = `${Math.round(width)}x${Math.round(height)}`;
  if (svg.dataset.strokeSize === key) return;
  svg.dataset.strokeSize = key;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  let path = svg.querySelector("path");
  if (!path) {
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
  }
  path.setAttribute("d", framePath(width, height, elementSeed(box)));
}

function paintRule(el) {
  const width = el.clientWidth;
  const height = el.clientHeight || 10;
  if (width < 2) return;
  const key = `${Math.round(width)}x${Math.round(height)}`;
  if (el.dataset.strokeSize === key) return;
  el.dataset.strokeSize = key;
  const seed = elementSeed(el);
  const path = strokePath(width, height / 2, seed, RULE_AMP, true);
  el.style.setProperty("--rule", `${svgMask(width, height, path)} center / 100% 100% no-repeat`);
}

function paintVertical(el) {
  if (el.dataset.strokeReady === "1") return;
  const length = 2000;
  const seed = elementSeed(el);
  const path = strokePath(length, RULE_BAND / 2, seed, RULE_AMP, false);
  el.dataset.strokeReady = "1";
  el.style.setProperty("--vrule", `${svgMask(RULE_BAND, length, path)} center top / ${RULE_BAND}px ${length}px no-repeat`);
}

function paintStepDivider(row) {
  const height = row.clientHeight - 24;
  if (height < 2) return;
  const key = String(Math.round(height));
  if (row.dataset.strokeSize === key) return;
  row.dataset.strokeSize = key;
  const seed = elementSeed(row);
  const path = strokePath(height, RULE_BAND / 2, seed, RULE_AMP, false);
  row.style.setProperty("--vrule", `${svgMask(RULE_BAND, height, path)} center / 100% 100% no-repeat`);
}

function paintCell(cell) {
  const width = cell.clientWidth - 26;
  if (width < 2) return;
  const key = String(Math.round(width));
  if (cell.dataset.strokeSize === key) return;
  cell.dataset.strokeSize = key;
  const seed = elementSeed(cell);
  const top = strokePath(width, RULE_BAND / 2, seed + 11, RULE_AMP, true);
  const bottom = strokePath(width, RULE_BAND / 2, seed + 29, RULE_AMP, true);
  const mask = (path) => `${svgMask(width, RULE_BAND, path)} center / 100% 100% no-repeat`;
  cell.style.setProperty("--rule-top", mask(top));
  cell.style.setProperty("--rule-bottom", mask(bottom));
}

function mountFrames() {
  const boxes = [...document.querySelectorAll(".wiggle-box")];
  boxes.forEach((box) => {
    if (!box.querySelector(".wiggle-stroke")) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "wiggle-stroke");
      svg.setAttribute("aria-hidden", "true");
      box.prepend(svg);
    }
  });

  const rules = [...document.querySelectorAll(".rule")];
  const rows = [...document.querySelectorAll(".step-row")];
  const grid = document.querySelector(".pilot-grid");
  const cells = [...document.querySelectorAll(".pilot-cell")];

  function paint() {
    rules.forEach(paintRule);
    rows.forEach(paintStepDivider);
    if (grid) paintVertical(grid);
    cells.forEach(paintCell);
    boxes.forEach(drawFrame);
  }

  paint();
  if (typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(paint);
  [...rules, ...rows, grid, ...cells, ...boxes].filter(Boolean).forEach((el) => observer.observe(el));
}

function mountSteps() {
  const steps = document.querySelector(".steps");
  if (!steps) return;
  const items = [...steps.querySelectorAll(":scope > .step")];
  const controllers = [];

  items.forEach((step) => {
    const button = step.querySelector(".step-toggle");
    const label = button.querySelector(".sr-only");
    const glyph = button.querySelector(".glyph");
    const name = label.textContent.replace(/^Show /, "");
    const panel = step.querySelector(".step-panel");
    let timer = 0;

    function setOpen(open, shouldLayout) {
      step.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      glyph.textContent = open ? "×" : "+";
      label.textContent = `${open ? "Hide" : "Show"} ${name}`;
      window.clearTimeout(timer);
      if (open) timer = window.setTimeout(() => setOpen(false, true), OPEN_MS);
      if (shouldLayout) layoutSteps();
    }

    setOpen(false, false);
    controllers.push({ step, setOpen });

    step.querySelector(".step-row").addEventListener("click", () => {
      const willOpen = button.getAttribute("aria-expanded") !== "true";
      if (willOpen) {
        controllers.forEach((other) => {
          if (other.step !== step) other.setOpen(false, false);
        });
      }
      setOpen(willOpen, true);
    });
  });

  function layoutSteps() {
    if (steps.dataset.locked !== "1") return;
    const open = items.find((step) => step.classList.contains("is-open"));
    const total = Number(steps.dataset.unitHeight);
    const tail = Number(steps.dataset.tailHeight);
    const others = open
      ? items.filter((step) => step !== open).reduce((sum, step) => sum + Number(step.dataset.compactHeight), 0)
      : 0;
    items.forEach((step) => {
      const height = !open
        ? Number(step.dataset.restHeight)
        : step === open
          ? total - tail - others
          : Number(step.dataset.compactHeight);
      step.style.height = `${height}px`;
    });
  }

  function lockHeight() {
    if (steps.dataset.locked === "1" || steps.offsetHeight < 2) return;
    const tail = steps.querySelector(":scope > li:last-child");
    let sum = tail.offsetHeight;
    steps.dataset.tailHeight = String(tail.offsetHeight);
    items.forEach((step) => {
      const rest = step.offsetHeight;
      step.dataset.restHeight = String(rest);
      step.dataset.compactHeight = String(rest - 32);
      sum += rest;
    });
    steps.dataset.unitHeight = String(sum);
    steps.style.height = `${sum}px`;
    steps.dataset.locked = "1";
    steps.classList.add("is-fixed");
    layoutSteps();
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockHeight);
  else lockHeight();
}

function wordCount(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function lineTexts(node) {
  const text = node.textContent;
  const range = document.createRange();
  const parts = text.split(/(\s+)/);
  let index = 0;
  let lineTop = null;
  let line = "";
  const lines = [];
  const flush = () => {
    if (line.trim()) lines.push(line.replace(/\u00a0/g, " ").trim());
  };
  for (const part of parts) {
    const start = index;
    index += part.length;
    if (!part.trim()) {
      line += part;
      continue;
    }
    range.setStart(node, start);
    range.setEnd(node, index);
    const rect = range.getClientRects()[0];
    if (!rect) {
      line += part;
      continue;
    }
    const top = Math.round(rect.top);
    if (lineTop === null) lineTop = top;
    if (Math.abs(top - lineTop) > 2) {
      flush();
      line = "";
      lineTop = top;
    }
    line += part;
  }
  flush();
  return lines;
}

function preventOrphans() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest(".sr-only, script, style")) return;
    if (parent.getBoundingClientRect().width < 2) return;

    for (let pass = 0; pass < 12; pass += 1) {
      const lines = lineTexts(node);
      if (lines.length < 2) return;
      const orphan = lines.find((line) => wordCount(line) === 1);
      if (!orphan) return;
      const text = node.textContent;
      const at = text.lastIndexOf(orphan.trim());
      if (at <= 0) return;
      let space = at - 1;
      while (space >= 0 && /\s/.test(text[space])) space -= 1;
      space += 1;
      if (space <= 0 || text[space - 1] === "\u00a0") return;
      node.textContent = `${text.slice(0, space)}\u00a0${text.slice(at)}`;
    }
  });
}

function mountOrphans() {
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(preventOrphans);
    return;
  }
  preventOrphans();
}

mountFrames();
mountSteps();
mountOrphans();
