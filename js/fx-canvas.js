(() => {
  /*!
   * mynav · fx-canvas.js — two one-shot GPU effects (star-map particle reveal, search-bar shatter)
   *
   * Fragment shaders adapted from Canvas UI by David Haz
   *   https://canvasui.dev · https://github.com/DavidHDev/canvas-ui
   *   components: ParticleReveal (src/lib/ParticleReveal/ParticleRevealVanilla.ts)
   *               Shatter        (src/lib/Shatter/ShatterVanilla.ts)
   * Changes for mynav: pointer/HTML-in-canvas plumbing removed; driven by a time-based
   * timeline over canvas-drawn content (the star-map <canvas>, or a 2D snapshot of the
   * search bar); EX LIBRIS brass dust tint; shatter gaps are transparent.
   *
   * MIT + Commons Clause License Condition v1.0
   * Copyright (c) 2026 David Haz
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, and distribute the Software as part of
   * an application, website, or product, subject to the following conditions:
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * Commons Clause Restriction: You may use this Software, including for any
   * commercial purpose, so long as you do not sell, sublicense, or redistribute the
   * components themselves - whether alone, in a bundle, or as a ported version.
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
   * CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THE SOFTWARE.
   */
  const BRASS = [0.79, 0.635, 0.29];
  const NAVY = [0.043, 0.067, 0.125];
  const PARCHMENT = [0.945, 0.906, 0.816];
  const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  const REVEAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uSize;
uniform float uScatter;
uniform float uDrift;
uniform float uAberration;
uniform float uBend;
uniform float uFade;
uniform float uThreshold;
uniform vec3 uBg;
uniform vec3 uTint;
uniform float uTime;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 samp (vec2 p) {
  vec2 uv = p / uRes;
  uv = clamp(uv, vec2(0.001), vec2(0.999));
  return texture(uContent, uv);
}

void main () {
  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float dist = length(pc - uPointer);
  float radius = max(uRadius, 1.0);
  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));
  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;

  float band = radius * 0.9;
  float ring = smoothstep(inner, radius, dist)
    * (1.0 - smoothstep(radius, radius + band, dist))
    * uActive;

  vec2 dir = (pc - uPointer) / max(dist, 1e-3);
  vec2 tang = vec2(-dir.y, dir.x);
  vec2 warp = (dir * -1.0 + tang * 0.6) * uBend * ring;
  float ca = uAberration * ring;

  float cellPx = max(uSize, 0.5) * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / cellPx);
  float n1 = hash(cell);
  float n2 = hash(cell + vec2(3.1, 7.7));
  float n3 = hash(cell + vec2(9.3, 1.3));
  float ft = floor(uTime * (2.0 + uDrift * 6.0));
  float n4 = hash(cell + vec2(ft * 0.613, ft * 0.831));

  float g0 = uThreshold * 0.6;
  float g1 = uThreshold * 1.6 + 0.01;
  vec3 lw = vec3(0.299, 0.587, 0.114);

  vec2 bp = pc + warp;
  vec4 bR = samp(bp + dir * ca);
  vec4 bC = samp(bp);
  vec4 bB = samp(bp - dir * ca);
  vec3 baseRgb = vec3(bR.r, bC.g, bB.b);
  float uiHome = smoothstep(g0, g1, dot(abs(baseRgb - uBg), lw));

  float rad = uScatter * pow(n1, 2.5) * (1.0 - e);
  float ang = n2 * 6.2832 + uTime * uDrift * (0.5 + n3 * 1.5);
  vec2 dustP = bp + vec2(cos(ang), sin(ang)) * rad;

  vec4 dR = samp(dustP + dir * ca);
  vec4 dC = samp(dustP);
  vec4 dB = samp(dustP - dir * ca);
  vec3 dustRgb = vec3(dR.r, dC.g, dB.b);
  float lumD = dot(dustRgb, lw);
  float dDust = dot(abs(dustRgb - uBg), lw);

  float gate = smoothstep(g0, g1, dDust);
  float falloff = 1.0 - 0.7 * rad / max(uScatter, 1.0);
  float prob = clamp(gate * (0.15 + 1.2 * sqrt(dDust)) * falloff, 0.0, 1.0) * uiHome;
  float speck = step(n4 * 0.999, prob);

  float shade = pow(max(lumD, 0.0), 0.4) * (0.8 + 0.4 * n3);
  vec3 dustCol = mix(uBg, mix(vec3(shade), uTint * (0.75 + 0.5 * shade), 0.7), clamp(uFade, 0.0, 1.0));

  vec3 unrevealed = mix(mix(baseRgb, uBg, uiHome), dustCol, speck);
  vec3 col = mix(unrevealed, baseRgb, e);
  outColor = vec4(col, 1.0);
}`;
  const SHATTER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uStrength;
uniform float uBase;
uniform float uTile;
uniform float uShards;
uniform float uCorner;
uniform float uLift;
uniform float uTilt;
uniform float uScatter;
uniform float uPersp;
uniform vec3 uGap;
uniform float uShadow;
uniform float uShading;
uniform float uRefract;
uniform float uDispersion;
uniform float uTime;
out vec4 outColor;

const float TAU = 6.28318530718;
const vec2 LIGHT = vec2(-0.514495755, 0.857492926);

vec2 hash22 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float smin (float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shardD (vec2 q, vec2 cell, float k) {
  float jit = uTile * 0.8 * clamp(uShards, 0.0, 1.0);
  vec2 s0 = (hash22(cell) - 0.5) * jit;
  float d = uTile;
  for (int i = 0; i < 9; i++) {
    if (i == 4) continue;
    vec2 g = vec2(float(i % 3 - 1), float(i / 3 - 1));
    vec2 sn = g * uTile + (hash22(cell + g) - 0.5) * jit;
    vec2 diff = sn - s0;
    float e = -dot(q - s0 - diff * 0.5, normalize(diff));
    d = smin(d, e, k);
  }
  return d;
}

vec4 pick4 (vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0005), vec2(0.9995));
  return texture(uContent, vec2(c.x, 1.0 - c.y));
}

float cellAct (vec2 cell, out vec2 sxy) {
  sxy = hash22(cell + 13.13);
  float mask = clamp(uBase, 0.0, 1.0) * clamp(uStrength, 0.0, 1.0);
  float th = sxy.x * 0.6;
  return smoothstep(th, th + 0.4, mask);
}

void cellDyn (vec2 cell, vec2 sxy, float act, out mat3 R, out float lift, out vec2 anchor, out float k) {
  vec2 center = (cell + 0.5) * uTile;
  vec4 seed = vec4(sxy, hash22(cell + 27.7));
  float wob = sin(uTime + seed.z * TAU);
  float maxT = 0.2 * clamp(uTilt, 0.0, 3.0) * act;
  float rx = (seed.y - 0.5) * 2.0 * maxT * (0.75 + 0.25 * wob);
  float ry = (seed.z - 0.5) * 2.0 * maxT * (0.75 + 0.25 * cos(uTime * 0.7 + seed.w * TAU));
  float rz = (seed.w - 0.5) * 1.2 * maxT * (0.85 + 0.15 * wob);
  float cx = cos(rx); float sx = sin(rx);
  float cy = cos(ry); float sy = sin(ry);
  float cz = cos(rz); float sz = sin(rz);
  R = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0)
    * mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy)
    * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  lift = uLift * act * (0.72 + 0.36 * seed.y) * (0.86 + 0.14 * sin(uTime * 0.9 + seed.w * TAU));
  vec2 shift = (seed.zw - 0.5) * 2.0 * uScatter * act * (0.85 + 0.15 * wob);
  anchor = center + shift;
  k = max(min(uCorner * act, uTile * 0.45), 1e-2);
}

bool invMap (vec2 P, mat3 R, float lift, vec2 anchor, out vec2 q) {
  vec2 w = P - anchor;
  float m11 = uPersp * R[0][0] + w.x * R[0][2];
  float m12 = uPersp * R[1][0] + w.x * R[1][2];
  float m21 = uPersp * R[0][1] + w.y * R[0][2];
  float m22 = uPersp * R[1][1] + w.y * R[1][2];
  float det = m11 * m22 - m12 * m21;
  if (abs(det) < 1e-4) return false;
  vec2 b = w * (uPersp - lift);
  q = vec2(m22 * b.x - m12 * b.y, m11 * b.y - m21 * b.x) / det;
  return true;
}

void main () {
  vec2 P = gl_FragCoord.xy;
  vec2 uvR = P / uResolution;
  vec4 tex = pick4(uvR);
  float maskB = clamp(uBase, 0.0, 1.0) * clamp(uStrength, 0.0, 1.0);
  if (maskB < 1e-4) { outColor = tex; return; }

  vec2 baseCell = floor(P / uTile);
  float act; mat3 R; float lift; vec2 anchor; float k;
  vec2 sxy; vec2 q;

  float shadowGain = clamp(uShadow, 0.0, 2.0) * 0.5;
  float shadowA = 0.0; float shadowZ = 0.0; vec2 shadowCell = vec2(1e6);
  float sumA = 0.0; float maxAct = 0.0;
  float k1 = -1e9; float a1 = 0.0; vec4 c1 = vec4(0.0); vec2 cell1 = vec2(1e6);
  float k2 = -1e9; float a2 = 0.0; vec4 c2 = vec4(0.0); vec2 cell2 = vec2(1e6);

  float restReach = uTile * 0.95 + 3.0;
  float reach = uTile * 1.8 + uScatter + uLift * 0.4;
  float rr = max(reach, uTile + uScatter + uLift);

  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 cell = baseCell + vec2(float(i), float(j));
      vec2 center = (cell + 0.5) * uTile;
      vec2 cp = center - P;
      float cd = dot(cp, cp);
      if (cd > rr * rr) continue;
      act = cellAct(cell, sxy);
      maxAct = max(maxAct, act);
      if (act < 1e-3) {
        if (cd > restReach * restReach) continue;
        float d = shardD(P - center, cell, 1e-2);
        float a = 1.0 - smoothstep(-1.5, 1.5, -d);
        if (a < 0.003) continue;
        sumA += a;
        if (0.0 > k1) { k2 = k1; a2 = a1; c2 = c1; cell2 = cell1; k1 = 0.0; a1 = a; c1 = tex; cell1 = cell; }
        else if (0.0 > k2) { k2 = 0.0; a2 = a; c2 = tex; cell2 = cell; }
        continue;
      }
      cellDyn(cell, sxy, act, R, lift, anchor, k);
      if (shadowGain > 1e-3 && lift > 0.5) {
        vec2 qs = P + LIGHT * lift * 0.5 - anchor;
        float blur = max(lift * 0.4, 1.0);
        float srad = uTile * 0.95 + blur;
        if (dot(qs, qs) < srad * srad) {
          float sA = 1.0 - smoothstep(-blur, blur, -shardD(qs, cell, k));
          sA *= shadowGain * act * act;
          if (sA > shadowA) { shadowA = sA; shadowZ = lift; shadowCell = cell; }
        }
      }
      if (cd > reach * reach) continue;
      if (!invMap(P, R, lift, anchor, q)) continue;
      float d = shardD(q, cell, k);
      float a = 1.0 - smoothstep(-1.5, 1.5, -d);
      if (a < 0.003) continue;
      vec2 uvS = (center + q) / uResolution;
      vec3 n = R * vec3(0.0, 0.0, 1.0);
      float rA = uRefract * act * act;
      vec2 refr = -n.xy * (rA * uTile * 0.25) / uResolution;
      float spread = uDispersion * 0.6;
      vec4 s0 = pick4(uvS + refr);
      vec4 col = vec4(
        pick4(uvS + refr * (1.0 + spread)).r,
        s0.g,
        pick4(uvS + refr * (1.0 - spread)).b,
        s0.a);
      col.rgb *= clamp(1.0 + clamp(uShading, 0.0, 2.0) * act * dot(n.xy, LIGHT) * 0.6, 0.0, 2.0);
      // brass glint on the shard face
      col.rgb += vec3(0.79, 0.635, 0.29) * 0.25 * act * max(dot(n.xy, LIGHT), 0.0) * col.a;
      sumA += a;
      if (lift > k1) { k2 = k1; a2 = a1; c2 = c1; cell2 = cell1; k1 = lift; a1 = a; c1 = col; cell1 = cell; }
      else if (lift > k2) { k2 = lift; a2 = a; c2 = col; cell2 = cell; }
    }
  }

  if (maxAct < 1e-3 && shadowA < 1e-3) { outColor = tex; return; }
  if (shadowA > 1e-3) {
    if (any(notEqual(cell1, shadowCell))) c1.rgb *= 1.0 - shadowA * clamp((shadowZ - k1) / (uTile * 0.2), 0.0, 1.0);
    if (any(notEqual(cell2, shadowCell))) c2.rgb *= 1.0 - shadowA * clamp((shadowZ - k2) / (uTile * 0.2), 0.0, 1.0);
  }
  float cover = clamp(sumA, 0.0, 1.0);
  float sep = max(uLift * 0.25, 2.0);
  float f = clamp((k1 - k2) / sep, 0.0, 1.0);
  float w1 = a1 * (0.5 + 0.5 * f);
  float w2 = a2 * (1.0 - w1);
  float layered = w1 + w2;
  vec4 shardCol = layered > 1e-6 ? (c1 * w1 + c2 * w2) / layered : vec4(uGap, 0.0);
  float bgRecv = shadowA * clamp(shadowZ / (uTile * 0.2), 0.0, 1.0);
  // (premultiplied alpha) Gaps are transparent (the real, already-cleared search bar shows through); shadows tint them.
  float gA = bgRecv * 0.55;
  vec4 gap = vec4(uGap * gA, gA);
  outColor = mix(gap, shardCol, cover);
}`;
  let active = [];
  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }
  let supportCache = null;
  function supported() {
    if (supportCache !== null) return supportCache;
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      supportCache = Boolean(gl && !gl.isContextLost());
      if (gl) {
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
    } catch (e) {
      supportCache = false;
    }
    return supportCache;
  }
  function dprOf() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }
  function build(canvas, frag, premultiplied) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: premultiplied,
      preserveDrawingBuffer: false
    });
    if (!gl || gl.isContextLost()) return null;
    const shaders = [];
    function compile(type, src) {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (window.console) console.warn("[NavFxCanvas] shader:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      shaders.push(s);
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    const u = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (info) u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplied);
    return { gl, prog, u, tex, buf, shaders };
  }
  function release(p) {
    if (!p) return;
    try {
      const gl = p.gl;
      gl.deleteTexture(p.tex);
      gl.deleteBuffer(p.buf);
      gl.deleteProgram(p.prog);
      p.shaders.forEach(function(s) {
        gl.deleteShader(s);
      });
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch (e) {
    }
  }
  function upload(p, source) {
    const gl = p.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  function overlay(rect, extraClass) {
    const c = document.createElement("canvas");
    c.className = "nav-fx-canvas " + extraClass;
    c.setAttribute("aria-hidden", "true");
    const s = c.style;
    s.position = "fixed";
    s.left = rect.left + "px";
    s.top = rect.top + "px";
    s.width = rect.width + "px";
    s.height = rect.height + "px";
    s.pointerEvents = "none";
    s.zIndex = "2147483000";
    s.margin = "0";
    s.contain = "strict";
    const dpr = dprOf();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    document.body.appendChild(c);
    return c;
  }
  function parseRgb(css) {
    const m = /rgba?\(([^)]+)\)/.exec(css || "");
    if (!m) return null;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 4 && parts[3] < 0.5) return null;
    if (parts.length < 3 || parts.some(function(n) {
      return isNaN(n);
    })) return null;
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }
  function isDark() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) {
      return true;
    }
  }
  function backgroundOf(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parseRgb(getComputedStyle(node).backgroundColor);
      if (c) return c;
      node = node.parentElement;
    }
    return isDark() ? NAVY : PARCHMENT;
  }
  function cssColor(c) {
    return "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
  }
  function ease(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function starReveal(data) {
    const host = data && data.host || document.querySelector(".star-map-container");
    const star = host ? host.querySelector(".star-map-canvas") : null;
    if (!star) return false;
    const rect = star.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const out = overlay(rect, "nav-fx-reveal");
    const p = build(out, REVEAL_FRAG, false);
    if (!p) {
      out.remove();
      return false;
    }
    const bg = backgroundOf(star.parentElement);
    const scratch = document.createElement("canvas");
    scratch.width = out.width;
    scratch.height = out.height;
    const sctx = scratch.getContext("2d");
    if (!sctx) {
      release(p);
      out.remove();
      return false;
    }
    const prevOpacity = star.style.opacity;
    star.style.opacity = "0";
    const DURATION = 1e3;
    const FADE_FROM = 0.82;
    const t0 = performance.now();
    let raf = 0;
    let done = false;
    const w = rect.width;
    const h = rect.height;
    const maxR = Math.sqrt(w * w + h * h) * 0.5 * 1.25 + 40;
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      star.style.opacity = prevOpacity;
      release(p);
      out.remove();
      active = active.filter(function(f) {
        return f !== finish;
      });
    }
    active.push(finish);
    function frame(now) {
      if (done) return;
      try {
        if (!star.isConnected || p.gl.isContextLost()) {
          finish();
          return;
        }
        const t = clamp01((now - t0) / DURATION);
        sctx.fillStyle = cssColor(bg);
        sctx.fillRect(0, 0, scratch.width, scratch.height);
        if (star.width > 0 && star.height > 0) sctx.drawImage(star, 0, 0, scratch.width, scratch.height);
        upload(p, scratch);
        const gl = p.gl;
        const u = p.u;
        gl.viewport(0, 0, out.width, out.height);
        gl.useProgram(p.prog);
        gl.uniform1i(u.uContent, 0);
        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uDpr, out.width / w);
        gl.uniform2f(u.uPointer, w * 0.5, h * 0.5);
        gl.uniform1f(u.uActive, 1);
        gl.uniform1f(u.uRadius, Math.max(1, ease(t) * maxR));
        gl.uniform1f(u.uSoftness, 0.7);
        gl.uniform1f(u.uSize, 1.5);
        gl.uniform1f(u.uScatter, 28);
        gl.uniform1f(u.uDrift, 1);
        gl.uniform1f(u.uAberration, 3);
        gl.uniform1f(u.uBend, 14);
        gl.uniform1f(u.uFade, 0.9);
        gl.uniform1f(u.uThreshold, 0.08);
        gl.uniform3f(u.uBg, bg[0], bg[1], bg[2]);
        gl.uniform3f(u.uTint, BRASS[0], BRASS[1], BRASS[2]);
        gl.uniform1f(u.uTime, (now - t0) / 1e3);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (t >= FADE_FROM) {
          star.style.opacity = prevOpacity;
          out.style.opacity = String(1 - (t - FADE_FROM) / (1 - FADE_FROM));
        }
        if (t >= 1) {
          finish();
          return;
        }
        raf = requestAnimationFrame(frame);
      } catch (e) {
        finish();
      }
    }
    raf = requestAnimationFrame(frame);
    return true;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawTextOf(ctx, el, text, origin, dpr) {
    if (!el || !text) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const cs = getComputedStyle(el);
    ctx.save();
    ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + parseFloat(cs.fontSize) * dpr + "px " + cs.fontFamily;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = "middle";
    const pad = parseFloat(cs.paddingLeft) || 0;
    ctx.beginPath();
    ctx.rect((r.left - origin.left) * dpr, (r.top - origin.top) * dpr, r.width * dpr, r.height * dpr);
    ctx.clip();
    ctx.fillText(text, (r.left - origin.left + pad) * dpr, (r.top - origin.top + r.height / 2) * dpr);
    ctx.restore();
  }
  function snapshotBar(frame, input, value, rect, dpr) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const cs = getComputedStyle(frame);
    const radius = (parseFloat(cs.borderTopLeftRadius) || 0) * dpr;
    const bw = (parseFloat(cs.borderTopWidth) || 0) * dpr;
    const fill = parseRgb(cs.backgroundColor) || backgroundOf(frame.parentElement);
    roundRect(ctx, 0, 0, c.width, c.height, radius);
    ctx.fillStyle = cssColor(fill);
    ctx.fill();
    if (bw > 0) {
      ctx.lineWidth = bw;
      ctx.strokeStyle = cs.borderTopColor || cssColor(BRASS);
      roundRect(ctx, bw / 2, bw / 2, c.width - bw, c.height - bw, Math.max(0, radius - bw / 2));
      ctx.stroke();
    }
    const glyph = frame.querySelector(".search-glyph");
    if (glyph) drawTextOf(ctx, glyph, glyph.textContent || "", rect, dpr);
    const select = frame.querySelector("select");
    if (select && select.selectedIndex >= 0 && select.options[select.selectedIndex]) {
      drawTextOf(ctx, select, select.options[select.selectedIndex].text, rect, dpr);
    }
    if (input) drawTextOf(ctx, input, value, rect, dpr);
    return c;
  }
  function shatter(data) {
    const input = data && data.input || document.getElementById("archive-search-input");
    const frame = data && data.frame || (input ? input.closest(".search-box-frame") : null) || input;
    if (!frame) return false;
    const rect = frame.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const dpr = dprOf();
    const snap = snapshotBar(frame, input, data && data.value || "", rect, dpr);
    if (!snap) return false;
    const out = overlay(rect, "nav-fx-shatter");
    const p = build(out, SHATTER_FRAG, true);
    if (!p) {
      out.remove();
      return false;
    }
    upload(p, snap);
    const DURATION = 800;
    const t0 = performance.now();
    let raf = 0;
    let done = false;
    const tileCss = Math.max(14, Math.min(26, rect.height * 0.5));
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      release(p);
      out.remove();
      active = active.filter(function(f) {
        return f !== finish;
      });
    }
    active.push(finish);
    function frameFn(now) {
      if (done) return;
      try {
        if (p.gl.isContextLost()) {
          finish();
          return;
        }
        const t = clamp01((now - t0) / DURATION);
        const crack = clamp01(t / 0.55);
        const gl = p.gl;
        const u = p.u;
        const k = out.width / rect.width;
        gl.viewport(0, 0, out.width, out.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(p.prog);
        gl.uniform1i(u.uContent, 0);
        gl.uniform2f(u.uResolution, out.width, out.height);
        gl.uniform1f(u.uStrength, 1);
        gl.uniform1f(u.uBase, ease(crack));
        gl.uniform1f(u.uTile, tileCss * k);
        gl.uniform1f(u.uShards, 1);
        gl.uniform1f(u.uCorner, 0);
        gl.uniform1f(u.uLift, (6 + 46 * t) * k);
        gl.uniform1f(u.uTilt, 1.2 + 1.6 * t);
        gl.uniform1f(u.uScatter, (3 + 26 * t * t) * k);
        gl.uniform1f(u.uPersp, 900 * k);
        gl.uniform3f(u.uGap, NAVY[0], NAVY[1], NAVY[2]);
        gl.uniform1f(u.uShadow, 0.6);
        gl.uniform1f(u.uShading, 0.7);
        gl.uniform1f(u.uRefract, 1.1);
        gl.uniform1f(u.uDispersion, 0.25);
        gl.uniform1f(u.uTime, (now - t0) / 1e3 * 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (t > 0.5) out.style.opacity = String(1 - (t - 0.5) / 0.5);
        if (t >= 1) {
          finish();
          return;
        }
        raf = requestAnimationFrame(frameFn);
      } catch (e) {
        finish();
      }
    }
    raf = requestAnimationFrame(frameFn);
    return true;
  }
  function play(kind, data) {
    try {
      if (reducedMotion() || !supported()) return false;
      if (kind === "starReveal") return starReveal(data || {});
      if (kind === "shatter") return shatter(data || {});
    } catch (e) {
      if (window.console) console.warn("[NavFxCanvas]", e);
    }
    return false;
  }
  function cancel() {
    active.slice().forEach(function(f) {
      try {
        f();
      } catch (e) {
      }
    });
    active = [];
  }
  window.NavFxCanvas = { play, cancel, supported, isActive: function() {
    return active.length > 0;
  } };
})();
