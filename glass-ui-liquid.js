/*!
 * Glass UI — optional liquid WebGL background. Include after glass-ui.js.
 * Adds Glass.liquid(host, opts) and auto-mounts every [data-g-liquid]; and a WebGL gradient for every [data-g-gradient].
 */
(function (G) {
  'use strict';
  /* Liquid background (WebGL, very slow, pauses when hidden) ----------
   * <div class="g-liquid" data-g-liquid data-speed="0.012"><i></i><i></i><i></i><i></i></div>
   * Own palette: data-colors="#dark,#mid,#light,#accent" and data-light="#highlight" (see .g-liquid--gold).
   * Renders a small canvas (about 40% size) at a low frame rate. It stops when the tab is hidden,
   * when the element is off screen or display:none, and when the user prefers reduced motion
   * (one still frame is drawn). If WebGL is unavailable the CSS blobs inside stay as a fallback. */
  var LQ_FRAG = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'uniform vec2 r; uniform float t; uniform vec3 c0,c1,c2,c3,lc;\n' +
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }\n' +
    'float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }\n' +
    'float H(vec2 p){ vec2 q=vec2(fbm(p+vec2(0.,t*.6)),fbm(p+vec2(5.2,1.3)-t*.5)); return fbm(p+2.2*q+t*.3); }\n' +
    'void main(){ vec2 uv=gl_FragCoord.xy/r; vec2 p=(uv-.5)*vec2(r.x/r.y,1.)*1.9; float e=.012;\n' +
    ' float h=H(p), hx=H(p+vec2(e,0.)), hy=H(p+vec2(0.,e));\n' +
    ' vec3 n=normalize(vec3((h-hx)/e*.55,(h-hy)/e*.55,1.));\n' +
    ' vec3 col=mix(c0,c1,smoothstep(.2,.55,h)); col=mix(col,c2,smoothstep(.45,.8,h)*.9); col=mix(col,c3,smoothstep(.2,.0,h)*.6+(1.-uv.y)*.15);\n' +
    ' vec3 hf=normalize(normalize(vec3(-.5,.55,.65))+vec3(0.,0.,1.)); float d=max(dot(n,hf),0.);\n' +
    ' col+=lc*(pow(d,55.)*.42+pow(d,8.)*.12);\n' +
    ' gl_FragColor=vec4(col,1.); }';
  function hex3(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
  /* The GPU part of a background is built late: after the page has loaded, in idle time, and only for a background that is shown
     (a scene the visitor has not picked costs nothing). Until then the CSS fallback inside the host is what is seen, so the first paint never waits for a shader. */
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
  function later(fn) {
    function go() { idle(fn, { timeout: 2000 }); }
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  /* one full-screen quad and the fragment shader `frag`: { gl, cv, pr } or null when there is no WebGL */
  function quad(frag) {
    var cv = document.createElement('canvas'); cv.className = 'g-liquid__canvas'; cv.setAttribute('aria-hidden', 'true');
    var gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }'), fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return { gl: gl, cv: cv, pr: pr };
  }
  /* Day cycle: dawn, noon, sunset, night; [dark, mid, light] per keyframe, smoothstep between them */
  var DAY = [[[.17,.13,.32],[.88,.47,.58],[1,.8,.55]], [[.03,.3,.42],[.1,.74,.8],[.8,.98,.95]], [[.22,.1,.3],[.94,.38,.26],[1,.74,.32]], [[.05,.07,.22],[.2,.22,.55],[.56,.52,.86]]];

  /* Glass.liquid(host, opts) returns its API at once; the canvas comes when the host is first on screen after load */
  function liquid(host, o) {
    if (!host) return null;
    if (host.__liquid) return host.__liquid;
    o = o || {};
    var speed = +(o.speed || host.getAttribute('data-speed') || 0.012);
    var attr = host.getAttribute('data-colors'), pal = o.colors || (attr ? attr.split(',').map(function (s) { return s.trim(); }) : ['#00283c', '#33a7e1', '#9bbbf9', '#34b8c9']);
    var light = o.light || host.getAttribute('data-light') || '#fff8f2'; /* colour of the highlights */
    var day = host.hasAttribute('data-day'), lift = +host.getAttribute('data-day') || 0, ph = .3;   /* data-day="0..1": starts in the day cycle (the number lightens it) */
    var gl = null, cv, pr, uR, uT, uC, uL, failed = false;
    var acc = 3.7, off = null, running = false, visible = false, W = 0, H = 0;
    function paint(p, l) { gl.useProgram(pr); uC.forEach(function (u, i) { gl.uniform3fv(u, hex3(p[i])); }); gl.uniform3fv(uL, hex3(l)); }
    function paintDay() {
      var x = ph * 4, i0 = Math.floor(x) % 4, i1 = (i0 + 1) % 4, f = x - Math.floor(x); f = f * f * (3 - 2 * f);
      var m = [0, 1, 2].map(function (j) { return DAY[i0][j].map(function (v, n) { v = v + (DAY[i1][j][n] - v) * f; return v + (1 - v) * lift; }); });
      gl.uniform3fv(uC[0], m[0]); gl.uniform3fv(uC[1], m[1]); gl.uniform3fv(uC[2], m[2]);
      gl.uniform3fv(uC[3], m[0].map(function (v, n) { return (v + m[1][n]) / 2; }));
    }
    function colours() { if (day) paintDay(); else paint(pal, light); }
    function build() {   /* false without WebGL: the CSS blobs inside stay as the fallback */
      var q = quad(LQ_FRAG); if (!q) return false;
      gl = q.gl; cv = q.cv; pr = q.pr;
      uR = gl.getUniformLocation(pr, 'r'); uT = gl.getUniformLocation(pr, 't');
      uC = ['c0', 'c1', 'c2', 'c3'].map(function (n) { return gl.getUniformLocation(pr, n); }); uL = gl.getUniformLocation(pr, 'lc');
      colours();
      host.insertBefore(cv, host.firstChild);
      var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); if (!running) still(); }, 200); });
      /* back to the tab: draw the frame again at once. A tab that was away may have lost the canvas's picture, and the glass over it blurs whatever is there in the first frame */
      document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) still(); });
      cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); host.classList.remove('is-gl'); });
      host.classList.add('is-gl');
      return true;
    }
    function size() {
      var w = host.clientWidth || 1, h = host.clientHeight || 1, s = Math.min(.4, 720 / w);
      var nw = Math.max(64, Math.round(w * s)), nh = Math.max(64, Math.round(h * s));
      if (nw !== W || nh !== H) { W = cv.width = nw; H = cv.height = nh; gl.viewport(0, 0, W, H); }
    }
    function frame() {
      gl.uniform2f(uR, W, H); gl.uniform1f(uT, acc);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function still() { size(); frame(); }
    /* the shared timer of Glass.scene (one for every animated background, with one speed) calls this */
    function step(dt) {
      acc += dt * speed; if (day) { ph = (ph + dt / 70) % 1; paintDay(); }
      frame(); return true;
    }
    function stop() { running = false; if (off) off(); off = null; }
    function start() {
      if (running || !gl) return; still();
      if (!speed) return;
      running = true; off = G.scene.add(step);
    }
    function show(v) {
      visible = v;
      if (v && !gl && !failed) failed = !build();
      visible ? start() : stop();
    }
    later(function () {
      if (window.IntersectionObserver) new IntersectionObserver(function (e) { show(e[0].isIntersecting); }).observe(host); else show(true);
    });
    var api = {
      start: start, stop: stop,
      setColors: function (p, l) { day = false; pal = p; light = l || light; if (gl) { paint(pal, light); if (!running) still(); } },
      setLift: function (v) { lift = +v || 0; if (gl && day) { paintDay(); if (!running) still(); } },   /* 0..1 lightens the day cycle (light theme) */
      setDay: function (on) { day = !!on; if (day) ph = .3; if (gl) { colours(); if (!running) still(); } }
    };
    host.__liquid = api; return api;
  }
  G.liquid = liquid;
  G.mount('[data-g-liquid]', function (h) { liquid(h); });

  /* Gradient background (WebGL) ---------------------------------------
   * <div class="scene" data-scene="gradient" data-g-gradient style="--sc0:#00283c; --sc1:#33a7e1; --sc2:#9bbbf9; --sc3:#34b8c9; --sc4:#74b7f9">
   * The same four soft blobs as the CSS gradient, drawn by the GPU so the page can scroll and blur over it cheaply. The blobs drift slowly (the shared timer
   * of Glass.scene, one speed with the liquid). Colours come from --sc0 (ground) and --sc1..--sc4 (blobs); change them any time. It draws only while
   * data-scene="gradient" (or the attribute is absent), and is built after load the first time that is so: the CSS gradient is the first frame.
   * Adds .is-gl to the host so CSS can drop its own gradient; without WebGL the CSS one stays. */
  var GR_FRAG = 'precision mediump float; uniform vec2 r; uniform vec3 c0,c1,c2,c3,c4; uniform vec4 b1,b2,b3,b4;\n' +
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float a(vec4 b, vec2 uv){ return 1.-smoothstep(0.,1.,length((uv-b.xy)/b.zw)); }\n' +
    'void main(){ vec2 uv=vec2(gl_FragCoord.x/r.x,1.-gl_FragCoord.y/r.y);\n' +
    ' vec3 col=mix(c0,c4,a(b4,uv)); col=mix(col,c3,a(b3,uv)); col=mix(col,c2,a(b2,uv)); col=mix(col,c1,a(b1,uv));\n' +
    ' col+=(hash(gl_FragCoord.xy)-.5)*2./255.; gl_FragColor=vec4(col,1.); }';
  var GR_BLOBS = [[18, 12, 60, 50, .6], [88, 18, 50, 50, .6], [72, 92, 60, 60, .62], [10, 85, 40, 40, .6]],   /* centre x y %, radii %, where the fade ends: as in the CSS gradient */
    GR_T = [40, 50, 56, 45], GR_A = [[38, 30], [-34, 34], [-38, -28], [34, -34]], GR_OFF = [0, 20, 45, 10],   /* drift: half-period s, reach %, phase s */
    GR_DARK = ['#00283c', '#33a7e1', '#9bbbf9', '#34b8c9', '#74b7f9'], GR_LIGHT = ['#e8f6ff', '#79bfe8', '#d1e0fd', '#89cfda', '#add5fe'];
  function gradient(host) {
    if (!host) return null;
    if (host.__gradient) return host.__gradient;
    var gl = null, cv, uR, uC, uB, ready = false, failed = false;
    var t = 0, W = 0, H = 0, off = null, visible = true, drift = GR_BLOBS.map(function () { return [0, 0]; });
    function build() {   /* false without WebGL: the CSS gradient stays */
      var q = quad(GR_FRAG); if (!q) { failed = true; return false; }
      gl = q.gl; cv = q.cv;
      var U = function (n) { return gl.getUniformLocation(q.pr, n); }; uR = U('r'); uC = ['c0', 'c1', 'c2', 'c3', 'c4'].map(U); uB = ['b1', 'b2', 'b3', 'b4'].map(U);
      W = H = 0; host.insertBefore(cv, host.firstChild); host.classList.add('is-gl');
      cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (off) off(); off = null; host.classList.remove('is-gl'); cv.remove(); gl = null; });
      off = G.scene.add(step);
      return true;
    }
    function colours() {
      var d = document.documentElement.getAttribute('data-theme') === 'light' ? GR_LIGHT : GR_DARK;
      uC.forEach(function (u, i) { var v = host.style.getPropertyValue('--sc' + i).trim(); gl.uniform3fv(u, hex3(/^#[0-9a-f]{6}$/i.test(v) ? v : d[i])); });
    }
    function size() {
      var w = host.clientWidth || 1, h = host.clientHeight || 1, s = Math.min(1, 1280 / w), nw = Math.max(64, Math.round(w * s)), nh = Math.max(64, Math.round(h * s));
      if (nw !== W || nh !== H) { W = cv.width = nw; H = cv.height = nh; gl.viewport(0, 0, W, H); gl.uniform2f(uR, W, H); }
    }
    function frame() {
      GR_BLOBS.forEach(function (b, i) { gl.uniform4f(uB[i], (b[0] + drift[i][0]) / 100, (b[1] + drift[i][1]) / 100, b[2] / 100 * b[4], b[3] / 100 * b[4]); });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function on() { return host.getAttribute('data-scene') === null || host.getAttribute('data-scene') === 'gradient'; }
    function ease(s, p) { var k = ((s / p) % 2 + 2) % 2, u = k < 1 ? k : 2 - k; return u * u * (3 - 2 * u); }
    function pose() { GR_T.forEach(function (p, i) { var e = ease(t + GR_OFF[i], p); drift[i] = [GR_A[i][0] * e, GR_A[i][1] * e]; }); }
    function still() {
      if (!gl && !(ready && on() && !failed && build())) return;
      cv.style.display = on() ? '' : 'none'; if (!on()) return; size(); colours(); pose(); frame();
    }
    function step(dt) { if (!on() || !visible) return false; t += dt; size(); pose(); frame(); return true; }
    new MutationObserver(still).observe(host, { attributes: true, attributeFilter: ['style', 'data-scene'] });
    new MutationObserver(still).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(host);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(still, 200); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) still(); });   /* see the liquid above */
    later(function () { ready = true; still(); });
    host.__gradient = { redraw: still };
    return host.__gradient;
  }
  G.gradient = gradient;
  G.mount('[data-g-gradient]', function (h) { gradient(h); });
})(window.Glass);
