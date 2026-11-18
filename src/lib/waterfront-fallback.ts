type LandmarkHit = { stop: number; x: number; y: number; w: number; h: number };

export function createWaterfrontFallback(canvas: HTMLCanvasElement, report: (message: string) => void) {
  const stops = ['Marine Drive', 'Kochi Metro', 'Water Metro', 'Container port'];
  const centers = [[303, 231], [430, 334], [682, 374], [133, 337]];
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hits: LandmarkHit[] = [];
  const triggered = [-100, -100, -100, -100];
  let active = false, progress = 0, current = -1, time = 0, frame = 0, previous = 0;
  let cx = 456, cy = 285, zoom = 1, scale = 1, ox = 0, oy = 0;
  const fraction = (a: number) => a - Math.floor(a);
  function draw(dt: number) {
    if (!ctx) return;
    const c = ctx, width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const px = Math.round(width * dpr), py = Math.round(height * dpr);
    if (canvas.width !== px || canvas.height !== py) { canvas.width = px; canvas.height = py; }
    const center = centers[current] ?? [456, 285];
    const ease = reduced.matches ? 1 : 1 - Math.exp(-4 * dt);
    cx += (center[0] - cx) * ease; cy += (center[1] - cy) * ease;
    zoom += ((current < 0 ? 1 : 1.75) - zoom) * ease;
    scale = Math.min(width / 720, height / 390) * zoom * (1 + .07 * progress);
    ox = width * (width > height ? .415 : .52) - cx * scale;
    oy = height * (width > height ? .52 : .41) - cy * scale;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sea = c.createLinearGradient(0, 0, 0, height);
    sea.addColorStop(0, '#174f67'); sea.addColorStop(.4, '#0b374e'); sea.addColorStop(1, '#03192f');
    c.fillStyle = sea; c.fillRect(0, 0, width, height);
    c.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
    hits.length = 0;
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color; c.fillRect(x, y, w, h);
    };
    const poly = (color: string, ...points: number[]) => {
      c.fillStyle = color; c.beginPath(); c.moveTo(points[0], points[1]);
      for (let j = 2; j < points.length; j += 2) c.lineTo(points[j], points[j + 1]);
      c.closePath(); c.fill();
    };
    const line = (color: string, weight: number, ...points: number[]) => {
      c.strokeStyle = color; c.lineWidth = weight; c.beginPath(); c.moveTo(points[0], points[1]);
      for (let j = 2; j < points.length; j += 2) c.lineTo(points[j], points[j + 1]); c.stroke();
    };
    for (let i = -2; i < 11; i++) {
      const x = i * 133;
      poly('rgba(165,229,229,.026)', x + 180, -450, x + 235, -450, x - 110, 457, x - 196, 457);
    }
    for (let row = 0; row < 3; row++) {
      const count = [22, 12, 6][row];
      for (let i = 0; i < count; i++) {
        const x = -100 + i * [53, 65, 76][row] + (row === 2 ? 170 : 0);
        const floor = 278 + row * 27 + x * .031;
        const tall = 47 + ((i * 41 + row * 67) % (85 + row * 24)) + row * 16;
        const w = 25 + (i * 7) % 12 + row * 3, y = floor - tall;
        const side = 5 + row * 2;
        rect(x, y, w, tall, ['#17455b', '#245366', '#315f6d'][row]);
        poly(['#12394e', '#1b4357', '#1e4656'][row], x + w, y, x + w + side, y - side / 2, x + w + side, floor - side / 2, x + w, floor);
        poly('#577e83', x, y, x + side, y - side / 2, x + w + side, y - side / 2, x + w, y);
        for (let wy = y + 5; wy < floor - 4; wy += 5 + row * 2) {
          for (let wx = x + 3; wx < x + w - 4; wx += 5 + row * 2) {
            c.globalAlpha = .18 + row * .18 + .18 * fraction(wx * .37 + wy * .27);
            const lit = time - triggered[0] < 4 && row === 2;
            rect(wx, wy, 2 + row, 2 + row * .55, lit ? '#fff3be' : '#ffcd85');
          }
        }
        c.globalAlpha = 1;
        if (row === 2) hits.push({stop: 0, x, y, w: w + side, h: tall});
      }
    }
    poly('#1b4857', -1400, 337, 1700, 373, 1700, 391, -1400, 355);
    // The viaduct, rolling stock and ferry share the same vanishing direction.
    for (let i = 0; i < 9; i++) {
      const x = 193 + i * 47, y = 323 + i * 1.55;
      rect(x, y, 6, 43, '#67868a'); rect(x - 4, y, 14, 7, '#89a2a0');
    }
    poly('#95a8a3', 150, 320, 625, 336, 625, 341, 150, 325);
    const excursion = (index: number, duration: number) => {
      const t = (time - triggered[index]) / duration;
      return t < 0 || t >= 1 ? 0 : .5 - .5 * Math.cos(t * Math.PI * 2);
    };
    const tx = 375 + 133 * excursion(1, 8), ty = 311 + (tx - 150) * .034;
    for (let car = 0; car < 3; car++) {
      const x = tx + car * 23, y = ty + car * .78;
      rect(x, y, 22, 8, '#c5d3ce'); rect(x, y + 5, 22, 2, '#42a9ae');
      for (let j = 0; j < 5; j++) rect(x + 1 + j * 4, y + 1, 3, 3, '#fddaa7');
    }
    hits.push({stop: 1, x: 160, y: 315, w: 465, h: 34}, {stop: 1, x: tx, y: ty - 4, w: 72, h: 18});
    rect(636, 350, 69, 14, '#42677a');
    for (let i = 0; i < 9; i++) rect(639 + i * 7, 352, 4, 7, '#f3ce8f');
    rect(633, 348, 76, 3, '#8fada7');
    const fx = 652 + 60 * excursion(2, 10), fy = 370 + 3 * Math.sin(time * .4);
    poly('#5a9aa2', fx, fy, fx + 51, fy, fx + 43, fy + 6, fx + 8, fy + 6);
    rect(fx + 7, fy - 7, 35, 7, '#a8b9b2');
    for (let i = 0; i < 6; i++) rect(fx + 9 + i * 5, fy - 6, 3, 4, '#f9ce86');
    hits.push({stop: 2, x: 631, y: 345, w: 81, h: 24}, {stop: 2, x: fx, y: fy - 10, w: 53, h: 20});
    for (let i = 0; i < 11; i++) {
      const x = 77 + i % 6 * 15, y = 358 - Math.floor(i / 6) * 8;
      rect(x, y, 14, 7, ['#a66d50', '#477980', '#878460'][i % 3]);
    }
    line('#ac886e', 4, 110, 353, 114, 292, 141, 292, 145, 353);
    line('#9eb6af', 1.3, 111, 349, 137, 296, 145, 349, 114, 296);
    line('#b79170', 4, 97, 290, 179, 290); line('#8ea7a7', 1.4, 98, 288, 124, 275, 178, 289);
    const lift = excursion(3, 7), hx = 164 - 32 * lift, hy = 330 - 13 * Math.sin(Math.PI * lift);
    line('#95adaa', 1, hx, 290, hx, hy); rect(hx - 7, hy, 14, 7, '#b98359');
    hits.push({stop: 3, x: 76, y: 274, w: 107, h: 93});
    for (let i = 0; i < 23; i++) {
      const x = ((i * 43 + 10 * time) % 808) - 45, y = 233 + (i % 3) * 57 + Math.sin(time * .8 + i) * 4 + (i * 7) % 16;
      c.fillStyle = i % 3 ? '#7caab2' : '#a1b097'; c.beginPath(); c.ellipse(x, y, 3.3, 1.5, 0, 0, 2 * Math.PI); c.fill();
      poly(c.fillStyle, x - 2.8, y, x - 5.3, y - 1.9, x - 5.3, y + 1.9);
    }
  }
  function tick(now: number) {
    frame = 0;
    if (!active || document.hidden) return;
    if (!previous || now - previous >= 32) {
      const dt = previous ? Math.min(.08, (now - previous) / 1000) : 0;
      if (!reduced.matches) time += dt;
      draw(dt); previous = now;
    }
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame); previous = 0;
    if (active && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function visit(index: number) {
    current = Number.isInteger(index) && index >= 0 && index < stops.length ? index : -1;
    refresh();
  }
  function activate(stop = Math.max(current, 0)) {
    if (!active) return;
    triggered[stop] = time;
    // Reduced-motion visitors see a still from the action.
    if (reduced.matches && stop) triggered[stop] -= 2.5;
    report(['Marine Drive · the windows brighten.', 'Kochi Metro · train departing.', 'Water Metro · ferry leaving the pontoon.', 'Container terminal · gantry shifting a container.'][stop]);
    refresh();
  }
  function click(event: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    const x = (event.clientX - r.left - ox) / scale, y = (event.clientY - r.top - oy) / scale;
    const hit = hits.slice().reverse().find(h => x >= h.x && x <= h.x+h.w && y >= h.y && y <= h.y+h.h);
    if (hit) activate(hit.stop);
  }
  function keydown(event: KeyboardEvent) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) activate(); }
  }
  canvas.addEventListener('click', click);
  canvas.addEventListener('keydown', keydown);
  document.addEventListener('visibilitychange', refresh);
  reduced.addEventListener('change', refresh);
  const observer = new ResizeObserver(refresh);
  observer.observe(canvas);
  return {
    stops, visit, activate: () => activate(),
    setState(visible: boolean, depth: number) {
      if (visible === active && depth === progress) return;
      const changed = active !== visible;
      active = visible; progress = Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0));
      if (changed || reduced.matches) refresh();
    },
    destroy() {
      active = false; cancelAnimationFrame(frame); observer.disconnect();
      reduced.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('click', click);
    },
  };
}
