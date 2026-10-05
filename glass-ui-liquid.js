/*!
 * Glass UI — optional liquid WebGL background. Include after glass-ui.js.
 * Adds Glass.liquid(host, opts) and auto-mounts every [data-g-liquid].
 */
(function (G) {
  'use strict';
  /* Liquid background (WebGL, very slow, pauses when hidden) ----------
   * <div class="g-liquid" data-g-liquid data-speed="0.012" data-fps="20"><i></i><i></i><i></i><i></i></div>
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
    ' col*=1.-.7*dot(uv-.5,uv-.5); gl_FragColor=vec4(col,1.); }';
  function hex3(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }

  function liquid(host, o) {
    if (!host) return null;
    if (host.__liquid) return host.__liquid;
    o = o || {};
    var speed = +(o.speed || host.getAttribute('data-speed') || 0.012), fps = +(o.fps || host.getAttribute('data-fps') || 20);
    var attr = host.getAttribute('data-colors'), pal = o.colors || (attr ? attr.split(',').map(function (s) { return s.trim(); }) : ['#14224a', '#3f78e0', '#58c4c0', '#8a6ee6']);
    var light = o.light || host.getAttribute('data-light') || '#fff8f2'; /* colour of the highlights */
    var cv = document.createElement('canvas'); cv.className = 'g-liquid__canvas'; cv.setAttribute('aria-hidden', 'true');
    var gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }'), fs = sh(gl.FRAGMENT_SHADER, LQ_FRAG);
    if (!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, 'r'), uT = gl.getUniformLocation(pr, 't');
    var uC = ['c0', 'c1', 'c2', 'c3'].map(function (n) { return gl.getUniformLocation(pr, n); }), uL = gl.getUniformLocation(pr, 'lc');
    function paint(p, l) { gl.useProgram(pr); uC.forEach(function (u, i) { gl.uniform3fv(u, hex3(p[i])); }); gl.uniform3fv(uL, hex3(l)); }
    paint(pal, light);
    /* Day cycle: dawn, noon, sunset, night; [dark, mid, light] per keyframe, smoothstep between them */
    var DAY = [[[.17,.13,.32],[.88,.47,.58],[1,.8,.55]], [[.03,.3,.42],[.1,.74,.8],[.8,.98,.95]], [[.22,.1,.3],[.94,.38,.26],[1,.74,.32]], [[.05,.07,.22],[.2,.22,.55],[.56,.52,.86]]];
    var day = false, lift = 0, ph = .3;
    function paintDay() {
      var x = ph * 4, i0 = Math.floor(x) % 4, i1 = (i0 + 1) % 4, f = x - Math.floor(x); f = f * f * (3 - 2 * f);
      var m = [0, 1, 2].map(function (j) { return DAY[i0][j].map(function (v, n) { v = v + (DAY[i1][j][n] - v) * f; return v + (1 - v) * lift; }); });
      gl.uniform3fv(uC[0], m[0]); gl.uniform3fv(uC[1], m[1]); gl.uniform3fv(uC[2], m[2]);
      gl.uniform3fv(uC[3], m[0].map(function (v, n) { return (v + m[1][n]) / 2; }));
    }
    host.insertBefore(cv, host.firstChild);

    var scrolling = false, scrollT = 0;
    window.addEventListener('scroll', function () { scrolling = true; clearTimeout(scrollT); scrollT = setTimeout(function () { scrolling = false; }, 160); }, { passive: true });
    var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var acc = 3.7, last = 0, timer = 0, raf = 0, running = false, visible = true, W = 0, H = 0;
    function size() {
      var w = host.clientWidth || 1, h = host.clientHeight || 1, s = Math.min(.4, 720 / w);
      var nw = Math.max(64, Math.round(w * s)), nh = Math.max(64, Math.round(h * s));
      if (nw !== W || nh !== H) { W = cv.width = nw; H = cv.height = nh; gl.viewport(0, 0, W, H); }
    }
    function draw(now) {
      raf = 0; if (!running) return;
      var dt = last ? Math.min((now - last) / 1000, .25) : 0; last = now;
      /* no redraw while the page scrolls: the glass above does not have to re-blur a moving background */
      if (scrolling) { timer = setTimeout(function () { raf = requestAnimationFrame(draw); }, 1000 / fps); return; }
      acc += dt * speed; if (day) { ph = (ph + dt * speed / .012 / 70) % 1; paintDay(); }
      frame();
      timer = setTimeout(function () { raf = requestAnimationFrame(draw); }, 1000 / fps);
    }
    function frame() {
      gl.uniform2f(uR, W, H); gl.uniform1f(uT, acc);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function still() { size(); frame(); }
    function stop() { running = false; clearTimeout(timer); if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    function start() {
      if (running) return; size();
      if (mq.matches || !speed) { still(); return; }
      running = true; raf = requestAnimationFrame(draw);
    }
    function sync() { (visible && !document.hidden) ? start() : stop(); }
    document.addEventListener('visibilitychange', sync);
    if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; sync(); }).observe(host);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); if (!running) still(); }, 200); });
    if (mq.addEventListener) mq.addEventListener('change', function () { stop(); sync(); });
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); host.classList.remove('is-gl'); });
    host.classList.add('is-gl');
    var api = {
      start: start, stop: stop,
      setColors: function (p, l) { day = false; pal = p; light = l || light; paint(pal, light); if (!running) still(); },
      setLift: function (v) { lift = +v || 0; if (day) { paintDay(); if (!running) still(); } },   /* 0..1 lightens the day cycle (light theme) */
      setDay: function (on) { day = !!on; if (day) { ph = .3; paintDay(); } else paint(pal, light); stop(); sync(); if (!running) still(); },
      setSpeed: function (v) { speed = +v || 0; stop(); sync(); }   /* 0 freezes on a still frame */
    };
    host.__liquid = api; sync(); return api;
  }
  G.liquid = liquid;
  G.mount('[data-g-liquid]', function (h) { liquid(h); });
})(window.Glass);
