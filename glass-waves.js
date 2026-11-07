/* The "Waves" background (#scene[data-scene="waves"]): slow flowing swells of colour with thin light contour lines running along them, drawn by a fragment shader.
   Own code: warped fractal noise, the contour lines are the iso-lines of that noise field. It takes the colours the Appearance panel sets on the scene (--sc0 the dark ground, --sc1..--sc4),
   so the picked background colour and the tone follow. Draws only while the scene is "waves" and the page is visible; WebGL 2 is needed, without it the CSS gradient (site.css) stays. */
(function () {
	'use strict';
	var scene = document.getElementById('scene');
	if (!scene) return;
	var STOCK = ['#1d2b52', '#5ea0ff', '#ff9ec2', '#46d1c1', '#a78bfa'];
	var VS = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
	var FS = '#version 300 es\nprecision highp float;\n' +
		'uniform vec2 uRes;uniform float uT;uniform vec3 uC[5];out vec4 o;\n' +
		'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
		'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.)),f.x),f.y);}\n' +
		'float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){s+=a*vn(p);p=m*p;a*=.5;}return s;}\n' +
		'void main(){\n' +
		' vec2 uv=gl_FragCoord.xy/uRes;vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.)*1.5;float t=uT*.0015;\n' +
		' vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t));\n' +
		' vec2 r=vec2(fbm(p+2.5*q+vec2(1.7,9.2)+t*1.3),fbm(p+2.5*q+vec2(8.3,2.8)-t));\n' +
		' float n=fbm(p+2.5*r);float m=fbm(p*.6+r+t);\n' +
		' vec3 c=mix(uC[0],uC[1],smoothstep(.1,.6,m));\n' +
		' c=mix(c,uC[2],smoothstep(.45,.9,length(q))*.5);\n' +
		' c=mix(c,uC[3],smoothstep(.5,.95,r.x)*.35);\n' +
		' float k=3.4,d=abs(fract(n*k)-.5)/k,e=.004,gr=length(vec2(fbm(p+2.5*r+vec2(e,0.))-n,fbm(p+2.5*r+vec2(0.,e))-n))/e*1.5/540.+3e-3,ds=d/gr;\n' +
		' float g=exp(-ds*.1)*.25+exp(-ds*.3)*.45+exp(-ds*.9)*.5;g=min(g,.8);\n' +
		' c+=mix(uC[4],vec3(1.),.3)*g*(.4+.6*smoothstep(.1,.6,m));\n' +
		' c*=1.-.3*dot(uv-.5,uv-.5)*2.;\n' +
		' c+=(h(gl_FragCoord.xy+uT)-.5)/255.;\n' +
		' o=vec4(c,1.);}';

	var cv = null, gl = null, prog, loc, off = null, acc = 0, cols = null, colsAt = 0, saveAt = 0, saveTimer = 0, savedR = -1, watch = 0;
	/* where the last page (or this one before a reload) left off: its time and its last frame (a small JPEG) are kept in localStorage (it is shared by tabs, so a link opened in a new tab goes on too); the time is taken up here, and the frame is painted
	   before the first paint by an inline script after the scene (--g-waves-poster), so the background goes on from the same moment instead of starting over */
	var KEY = 'g-waves';
	var SLOW = .5;   /* Waves drift at half the kit speed (Calm was too quick for them); every speed step scales with it */
	/* One phase for every page and tab: the record is a line, { t: the time at the moment `at`, r: how fast it runs (the kit speed times SLOW) }, so the time NOW is t + (now - at) * r on any page, whenever it was opened
	   and however long a tab sat hidden. A page that is drawing writes the line (its own time at this moment), the others take it up (the storage event, or when the tab is shown again); a hidden page never writes (it would
	   put a stale time under a fresh `at`). A record without `at` (the old format) is a plain time. */
	function rate() { var k = window.Glass && Glass.scene && Glass.scene.speed ? Glass.scene.speed() : 1; return (typeof k === 'number' ? k : 1) * SLOW; }
	function phase(P) { return P && typeof P.t === 'number' ? (typeof P.at === 'number' && typeof P.r === 'number' ? P.t + Math.max(0, Date.now() - P.at) / 1000 * P.r : P.t) : null; }
	function adopt() { try { var t = phase(JSON.parse(localStorage.getItem(KEY))); if (t !== null) { acc = t; return true; } } catch (e) {} return false; }
	/* no record yet (first visit, cleared storage, another browser): start from the Unix clock, not from a fixed number, so the first phase is the same on every device that starts at the default speed; the time runs at SLOW per second, like the clock,
	   and wraps every 20000 s so the shader's float stays precise */
	function epoch() { return (Date.now() / 1000 % 20000) * SLOW; }
	if (!adopt()) acc = epoch();
	var SCALE = .5;   /* the field is soft: half the pixels are enough, the browser smooths it up */

	function rgb(s) {
		var m = /^#([0-9a-f]{6})$/i.exec((s || '').trim());
		if (m) { var n = parseInt(m[1], 16); return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
		m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s || '');
		return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : null;
	}
	function colours() {
		var now = performance.now();
		if (cols && now - colsAt < 400) return cols;
		var cs = getComputedStyle(scene), out = [];
		for (var i = 0; i < 5; i++) out.push(rgb(cs.getPropertyValue('--sc' + i)) || rgb(STOCK[i]));
		colsAt = now; return cols = out;
	}
	function shader(type, src) {
		var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
		return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
	}
	function build() {
		cv = document.createElement('canvas');
		cv.className = 'waves-canvas'; cv.setAttribute('aria-hidden', 'true');
		gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
		var vs = gl && shader(gl.VERTEX_SHADER, VS), fs = gl && shader(gl.FRAGMENT_SHADER, FS);
		if (!vs || !fs) { cv = gl = null; return false; }
		prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv = gl = null; return false; }
		gl.useProgram(prog);
		var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
		loc = { res: gl.getUniformLocation(prog, 'uRes'), t: gl.getUniformLocation(prog, 'uT'), c: gl.getUniformLocation(prog, 'uC') };
		cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); }, false);
		return true;
	}
	function size() {
		/* one size on every page: the window's, whatever the scene around it (the home page's is taller), centred; the browser stretches the small picture up */
		var w = Math.max(2, Math.round(innerWidth * SCALE)), h = Math.max(2, Math.round(innerHeight * SCALE));
		cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
		if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
	}
	function draw() {
		if (!cv || !cv.parentNode) return false;
		size();
		gl.viewport(0, 0, cv.width, cv.height);
		gl.uniform2f(loc.res, cv.width, cv.height);
		gl.uniform1f(loc.t, acc);
		gl.uniform3fv(loc.c, new Float32Array(colours().reduce(function (a, c) { return a.concat(c); }, [])));
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		return true;
	}
	/* the kit's shared timer (Glass.scene: one clock and one speed for every animated background; speed 0 = still) calls this with the seconds already times the speed */
	/* the poster is only the picture of the colours it was drawn with: the ground it was saved over is recorded, and a poster of another ground is not shown */
	function ground() { var c = getComputedStyle(cv.parentNode); return c.getPropertyValue('--sc0').trim() + c.getPropertyValue('--sc1').trim() + document.documentElement.getAttribute('data-theme'); }
	function save(force) {
		saveTimer = 0;
		if ((!force && document.hidden) || !cv || !cv.parentNode || !draw()) return;
		try { savedR = rate(); localStorage.setItem(KEY, JSON.stringify({ t: acc, at: Date.now(), r: savedR, k: ground(), u: cv.toDataURL('image/jpeg', .72), w: innerWidth, h: innerHeight })); saveAt = performance.now(); } catch (e) {}
	}
	function later() { if (!saveTimer) saveTimer = setTimeout(save, 600); }
	function step(dt) { cols = null; acc += dt * SLOW; var ok = draw(); if (ok && performance.now() - saveAt > 6000) later(); return ok; }
	/* the colours (--sc0..4) come from an inline script that runs after this file: drawing before that would paint the stock palette (a bluish-pink flash, like Aurora) and save it as the poster;
	   the poster / CSS ground stays until they are there (the style observer calls sync again), and a page that never sets them gets the stock palette once it has loaded */
	function haveColours() { return getComputedStyle(scene).getPropertyValue('--sc1').trim() !== '' || document.readyState === 'complete'; }
	function start() {
		if (!haveColours()) return;
		if (!cv && !build()) return;
		if (!cv.parentNode) scene.appendChild(cv);
		scene.classList.add('is-waves');
		draw(); later();
		if (!off && window.Glass && Glass.scene) off = Glass.scene.add(step);
		if (!watch) watch = setInterval(function () { if (rate() !== savedR) later(); }, 1000);   /* a speed picked in the panel changes the line: write it */
	}
	function stop() {
		if (off) off(); off = null;
		clearInterval(watch); watch = 0;
		scene.classList.remove('is-waves');
		if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
	}
	function sync() { cols = null; if (cv) later(); scene.getAttribute('data-scene') === 'waves' ? start() : stop(); }   /* also on the style: a picked colour sets --sc0..4 there, and a still scene must repaint */

	new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ['data-scene', 'style'] });
	window.addEventListener('resize', function () { cols = null; draw(); });
	sync();
	window.addEventListener('load', sync);
	function leave(force) { clearTimeout(saveTimer); save(force === true); }
	window.addEventListener('pagehide', function () { leave(); });
	document.addEventListener('visibilitychange', function () {   /* the frame and the time of this very moment; on return the time of the others */
		if (document.visibilityState === 'hidden') leave(true); else if (adopt() && cv) draw();
	});
	window.addEventListener('storage', function (e) { if (e.key === KEY && !document.hidden && adopt() && cv) draw(); });
})();
