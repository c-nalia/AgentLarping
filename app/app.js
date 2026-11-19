/* Alarping — fake agent runtime */
(function () {
  const { R, MODELS, VERBS, LANGS, PROJECTS, TASKS, FOLLOWUPS, THOUGHTS, SAYS, SUBTASKS, SEARCHES, fill, commitMsg } = window.ALARP;
  const KILL = Symbol('kill'), INTERRUPT = Symbol('interrupt');
  const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  const MAX_AGENTS = 12;
  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const raw = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  const native = window.alarping || null;

  const G = { agents: [], paused: false, speed: 1, maxId: null, focusId: null, seq: 0, tokens: 0, cost: 0, saver: false, windowCount: 1 };
  const grid = $('#grid');

  /* ====================================================================== */
  class Agent {
    constructor(modelId, opts = {}) {
      this.id = ++G.seq;
      this.model = MODELS[modelId];
      this.project = pickProject(opts.project, opts.custom);
      this.L = LANGS[this.project.lang];
      this.firstTask = (opts.task || '').trim() || null;
      this.mode = opts.mode || 'accept';
      this.paused = false; this.dead = false; this.interrupt = null; this.queue = [];
      this.state = 'idle';
      this.tokens = 0; this.ctxUsed = R.int(8, 20); this.spinning = false; this.spinStart = 0; this.spinTokens = 0; this.verb = 'Thinking';
      this.typing = false; this.waitingInput = null; this.turns = 0;
      this.build();
      this.loop();
    }

    /* ---------- DOM ---------- */
    build() {
      const m = this.model, p = this.project;
      const root = el('section', 'pane'); root.dataset.model = m.id; root.dataset.id = this.id;
      root.innerHTML = `
        <header class="pane-head">
          <span class="led"></span><span class="model">${m.name}</span>${m.tier ? `<span class="tier">${m.tier.toUpperCase()}</span>` : ''}
          <span class="proj">~/projects/${esc(p.name)}</span><span class="branch">⎇ ${esc(p.branch)}</span>
          <span class="sp"></span><span class="ctxbar" title="contexto"><b></b></span>
          <button class="bp" title="Pausar">⏸</button><button class="bm" title="Maximizar (duplo clique no cabeçalho)">⤢</button><button class="x" title="Fechar (Ctrl+W)">✕</button>
        </header>
        <div class="term"></div>
        <div class="foot">
          <div class="spin off"><span class="g">✻</span><span class="v">Thinking…</span><span class="meta"></span></div>
          <div class="prompt"><span>&gt;</span><input spellcheck="false" placeholder='Try "refactor ${esc(R.pick(p.files))}"'></div>
          <div class="hints"><span class="mode"></span><span class="r">? for shortcuts</span></div>
        </div>`;
      this.root = root; this.term = $('.term', root); this.spinEl = $('.spin', root); this.input = $('.prompt input', root);
      this.led = $('.led', root); this.ctxEl = $('.ctxbar b', root); this.modeEl = $('.hints .mode', root); this.hintR = $('.hints .r', root);
      $('.bp', root).onclick = (e) => { e.stopPropagation(); this.togglePause(); };
      $('.bm', root).onclick = (e) => { e.stopPropagation(); toggleMax(this.id); };
      $('.x', root).onclick = (e) => { e.stopPropagation(); this.kill(); };
      $('.pane-head', root).ondblclick = () => toggleMax(this.id);
      root.addEventListener('mousedown', () => setFocus(this.id));
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.input.value.trim()) { this.userSubmit(this.input.value.trim()); this.input.value = ''; }
        if (e.key === 'Escape') { e.stopPropagation(); this.esc(); }
        if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); this.cycleMode(); }
      });
      this.renderMode();
      grid.appendChild(root);
    }
    renderMode() {
      const t = { accept: '⏵⏵ accept edits on (shift+tab to cycle)', default: '? for shortcuts', plan: '⏸ plan mode on (shift+tab to cycle)' }[this.mode];
      this.modeEl.textContent = this.mode === 'default' ? '' : t;
      this.modeEl.classList.toggle('plan', this.mode === 'plan');
    }
    cycleMode() { this.mode = { default: 'accept', accept: 'plan', plan: 'default' }[this.mode]; this.renderMode(); }
    setState(s) { this.state = s; this.led.className = 'led ' + (this.paused ? 'paused' : s); }
    atBottom() { const t = this.term; return t.scrollHeight - t.scrollTop - t.clientHeight < 60; }
    add(node) {
      const stick = this.atBottom();
      this.term.appendChild(node);
      while (this.term.childElementCount > 260) this.term.firstElementChild.remove();
      if (stick) this.term.scrollTop = this.term.scrollHeight;
      return node;
    }
    scroll() { const t = this.term; if (t.scrollHeight - t.scrollTop - t.clientHeight < 140) t.scrollTop = t.scrollHeight; }
    ctxLeft() { return Math.max(0, 100 - (this.ctxUsed / this.model.ctxK) * 100 * 2.2); }
    useCtx(k) {
      this.ctxUsed += k;
      if (this.ctxLeft() < 4) this.needCompact = true;
      const left = this.ctxLeft();
      this.ctxEl.style.width = (100 - left) + '%';
      this.ctxEl.style.background = left < 20 ? 'var(--warn)' : 'var(--dim)';
      this.hintR.innerHTML = left < 25 ? `<span class="low">Context left until auto-compact: ${Math.round(left)}%</span>` : '? for shortcuts';
    }

    /* ---------- timing ---------- */
    async sleep(ms) {
      let left = ms;
      while (left > 0) {
        if (this.dead) throw KILL;
        if (this.interrupt) throw INTERRUPT;
        const step = Math.min(left, 40);
        await raw(step);
        if (!this.paused && !G.paused) left -= step * G.speed * this.model.speed;
      }
    }
    async hold(ms) { return this.sleep(ms * (0.75 + Math.random() * 0.5)); }

    spin(verb) {
      this.verb = verb || R.pick(VERBS); this.spinning = true; this.spinStart = performance.now(); this.spinElapsed = 0; this.spinTokens = 0;
      this.spinEl.classList.remove('off'); $('.v', this.spinEl).textContent = this.verb + '…'; this.setState('working');
    }
    spinStop() { this.spinning = false; this.spinEl.classList.add('off'); }
    tick(dt) {
      if (!this.spinning || this.paused || G.paused || this.dead) return;
      const f = G.speed * this.model.speed;
      this.spinElapsed += dt * f;
      const tps = (this.model.id === 'haiku' ? 140 : this.model.id === 'fable' ? 70 : 90) * (0.6 + Math.random() * 0.8);
      const d = tps * dt / 1000 * f;
      this.spinTokens += d; this.tokens += d; G.tokens += d; G.cost += d * this.model.rate / 1e6 * 1.6;
      const g = GLYPHS[Math.floor(performance.now() / 120) % GLYPHS.length];
      $('.g', this.spinEl).textContent = g;
      $('.meta', this.spinEl).textContent = `(${Math.floor(this.spinElapsed / 1000)}s · ↓ ${fmtK(this.spinTokens)} tokens · esc to interrupt)`;
    }

    /* ---------- primitives ---------- */
    async stream(target, text, cps = 90) {
      let i = 0;
      while (i < text.length) {
        const n = R.int(2, 6);
        target.textContent += text.slice(i, i + n); i += n;
        this.scroll();
        await this.sleep(1000 / cps * n);
      }
    }
    async streamMd(target, text, cps) { await this.stream(target, text, cps); target.innerHTML = md(target.textContent); }
    row(cls, dot) {
      const m = el('div', 'm ' + cls);
      const r = el('div', 'row'); r.append(el('span', 'dot', dot), el('span', 'c'));
      m.append(r); return m;
    }
    async say(text) {
      if (this.needCompact) { this.needCompact = false; await this.compact(); this.spin(); }
      const m = this.add(this.row('say', '⏺'));
      await this.streamMd($('.c', m), text, 110);
      await this.hold(250);
    }
    sys(html, cls = 'sys') { this.add(el('div', 'm ' + cls, html)); }
    async think(len = 1) {
      const m = this.model;
      if (R.chance(0.15 / m.think)) return;
      const ultra = m.id === 'fable' && R.chance(0.5);
      this.spin(ultra ? 'Ultrathinking' : 'Thinking');
      await this.hold(600 * m.think);
      const box = this.add(el('div', 'm think'));
      box.append(el('span', 'hd', `✻ ${ultra ? 'Ultrathinking' : 'Thinking'}…`), el('span', 'tx'));
      const n = Math.max(1, Math.round(len * m.think * R.int(1, 2)));
      const parts = R.sample(THOUGHTS, Math.min(n, 3)).map((t) => fill(t, this.project));
      await this.stream($('.tx', box), parts.join(' '), 140);
      this.useCtx(R.int(1, 3));
      await this.hold(300);
    }
    toolStart(name, arg) {
      const m = this.add(this.row('tool', '⏺'));
      $('.c', m).innerHTML = `<span class="name">${esc(name)}</span>${arg != null ? `(<span class="arg">${esc(arg)}</span>)` : ''}`;
      return m;
    }
    toolEnd(m, lines, ok = true, max = 4) {
      m.classList.add(ok ? 'ok' : 'bad');
      if (!lines || !lines.length) return;
      const res = el('div', 'res' + (lines.length > 1 ? ' out' : ''));
      const shown = lines.slice(0, max), hidden = lines.length - shown.length;
      res.innerHTML = shown.map((l, i) => (i === 0 ? '<span class="el">⎿</span>  ' : '   ') + colorize(l)).join('\n');
      if (hidden > 0) {
        const more = el('span', 'more', `\n   … +${hidden} lines (ctrl+r to expand)`);
        more.onclick = () => { res.innerHTML = lines.map((l, i) => (i === 0 ? '<span class="el">⎿</span>  ' : '   ') + colorize(l)).join('\n'); };
        res.append(more);
      }
      m.append(res); this.scroll();
    }
    async tool(name, arg, dur, lines, ok = true, max) {
      const m = this.toolStart(name, arg);
      await this.hold(dur);
      this.toolEnd(m, typeof lines === 'function' ? lines() : lines, ok, max);
      await this.hold(200);
      return m;
    }

    /* ---------- tools ---------- */
    async read(file) {
      const n = R.int(30, 420);
      await this.tool('Read', file, R.int(400, 1200), [`Read <b>${n}</b> lines`]);
      this.useCtx(n / 60);
    }
    async grep() {
      const p = this.project, fn = R.pick(p.fns);
      const n = R.int(1, 14);
      await this.tool('Search', `pattern: "${fn}", path: "${p.files[0].split('/')[0]}"`, R.int(300, 900), [`Found <b>${n}</b> ${n === 1 ? 'file' : 'files'}`]);
      this.useCtx(0.5);
    }
    async glob() {
      const ext = { ts: 'ts', tsx: 'tsx', py: 'py', rs: 'rs', go: 'go' }[this.project.lang];
      await this.tool('Search', `pattern: "**/*.${ext}"`, R.int(200, 600), [`Found <b>${R.int(12, 140)}</b> files`]);
    }
    async edit(file) {
      const snip = R.pick(this.L.snippets);
      const m = this.toolStart('Update', file);
      await this.hold(R.int(900, 2200));
      m.classList.add('ok');
      const start = R.int(12, 220);
      const res = el('div', 'res');
      const a = snip.add.length, d = snip.del.length;
      res.innerHTML = `<span class="el">⎿</span>  Updated <b>${esc(file)}</b> with <b>${a}</b> addition${a > 1 ? 's' : ''} and <b>${d}</b> removal${d > 1 ? 's' : ''}`;
      const diff = el('div', 'diff');
      let ln = start;
      const rows = [];
      snip.ctx.forEach((l) => rows.push(['c', ln++, ' ', l]));
      let dl = ln; snip.del.forEach((l) => rows.push(['d', dl++, '-', l]));
      snip.add.forEach((l) => rows.push(['a', ln++, '+', l]));
      snip.post.forEach((l) => rows.push(['c', ln++, ' ', l]));
      m.append(res, diff);
      for (const [k, n, s, l] of rows) {
        diff.append(el('div', k, `<span class="n">${n}</span>${s} ${esc(l)}`));
        this.scroll();
        await this.sleep(35);
      }
      this.useCtx(1.5);
      await this.hold(300);
    }
    async write(file) {
      const n = R.int(20, 160);
      await this.tool('Write', file, R.int(900, 2000), [`Wrote <b>${n}</b> lines to <b>${esc(file)}</b>`]);
      this.useCtx(n / 50);
    }
    async bash(cmd, lines, ok = true, dur = 1500) {
      await this.tool('Bash', cmd, R.int(dur * 0.7, dur * 1.6), lines, ok, 4);
      this.useCtx(lines.length / 10);
    }
    async todos(items, cur) {
      const m = this.toolStart('Update Todos');
      await this.hold(350);
      m.classList.add('ok');
      const box = el('div', 'res todo');
      box.innerHTML = items.map((t, i) => {
        const done = i < cur || cur === Infinity, now = i === cur;
        const pre = i === 0 ? '<span class="el">⎿</span>  ' : '   ';
        return `<div>${pre}<span class="${done ? 'done' : now ? 'cur' : ''}"><span class="bx">${done ? '☒' : '☐'}</span> ${esc(t.text)}</span></div>`;
      }).join('');
      m.append(box); this.scroll();
      await this.hold(250);
    }
    async subagents() {
      const p = this.project;
      await this.say(R.pick(SAYS.sub));
      const n = this.model.id === 'fable' ? R.int(2, 4) : R.int(1, 3);
      const nodes = [];
      for (let i = 0; i < n; i++) {
        const m = this.toolStart('Task', fill(R.pick(SUBTASKS), p));
        const r = el('div', 'res', '<span class="el">⎿</span>  Running…'); m.append(r);
        nodes.push([m, r, 0]); await this.sleep(150);
      }
      this.spin(R.pick(VERBS));
      let alive = nodes.length;
      while (alive) {
        await this.sleep(R.int(500, 1100));
        for (const nd of nodes) {
          if (nd[2] < 0) continue;
          nd[2] += R.int(1, 3);
          const tool = R.pick(['Read', 'Search', 'Read', 'Bash']);
          if (nd[2] > R.int(8, 16)) {
            nd[1].innerHTML = `<span class="el">⎿</span>  Done (${nd[2]} tool uses · ${(R.int(80, 600) / 10).toFixed(1)}k tokens · ${R.int(0, 2)}m ${R.int(1, 59)}s)`;
            nd[0].classList.add('ok'); nd[2] = -1; alive--;
          } else nd[1].innerHTML = `<span class="el">⎿</span>  ${tool}(${esc(R.pick(p.files))})\n   +${nd[2]} more tool uses`;
        }
        this.scroll();
      }
      this.useCtx(R.int(3, 8));
      await this.hold(300);
    }
    async webSearch() {
      const q = fill(R.pick(SEARCHES), this.project);
      await this.tool('Web Search', `"${q}"`, R.int(1500, 3000), [`Did 1 search in ${R.int(1, 4)}s`]);
      this.useCtx(3);
    }

    async permission(kind, cmd, desc) {
      if (this.mode === 'accept' && kind !== 'Bash command') return true;
      if (this.mode === 'accept' && R.chance(0.5)) return true;
      this.spinStop(); this.setState('waiting');
      const box = this.add(el('div', 'perm'));
      const proj = '~/projects/' + this.project.name;
      box.innerHTML = `<div class="pt">${esc(kind)}</div><div class="pc">${esc(cmd)}</div><div class="pd">${esc(desc)}</div><div>Do you want to proceed?</div>
        <div class="opt sel" data-v="1">❯ 1. Yes</div><div class="opt" data-v="2">  2. Yes, and don't ask again for <b>${esc(cmd.split(' ').slice(0, 2).join(' '))}</b> commands in ${esc(proj)}</div><div class="opt" data-v="3">  3. No, and tell the agent what to do differently <span class="el">(esc)</span></div>`;
      let choice = null;
      box.querySelectorAll('.opt').forEach((o) => o.onclick = () => { choice = o.dataset.v; });
      const auto = R.chance(0.2) ? '2' : '1';
      let t = R.int(1800, 4200);
      while (!choice && t > 0) { await this.sleep(50); t -= 50; }
      choice = choice || auto;
      box.querySelectorAll('.opt').forEach((o) => { o.classList.toggle('sel', o.dataset.v === choice); o.innerHTML = o.innerHTML.replace(/^❯ |^ {2}/, o.dataset.v === choice ? '❯ ' : '  '); o.onclick = null; });
      await this.sleep(350);
      box.classList.add('done');
      if (choice === '3') { this.interrupt = 'stop'; throw INTERRUPT; }
      if (choice === '2' && this.mode === 'default') { /* stays default but fewer prompts */ this.mode = 'accept'; this.renderMode(); }
      this.spin();
      return true;
    }

    async runTests(allowFail = true) {
      const p = this.project, L = this.L;
      await this.say(fill(R.pick(SAYS.test), p));
      this.spin('Testing');
      const cmd = { ts: 'npm test', tsx: 'npm test', py: 'uv run pytest -q', rs: 'cargo test', go: 'go test ./...' }[p.lang];
      if (allowFail && R.chance(0.35)) {
        const failName = { ts: 'rotates refresh token on reuse', tsx: 'undo restores previous layer order', py: 'test_grouped_split_no_leakage', rs: R.pick(p.tests), go: 'TestRouterFallback' }[p.lang];
        await this.bash(cmd, L.testFail(p, failName), false, 3200);
        await this.think(0.5);
        await this.say(R.pick(SAYS.failfix));
        await this.edit(R.pick(p.files));
        await this.bash(cmd, L.testPass(p), true, 3000);
      } else {
        await this.bash(cmd, L.testPass(p), true, 3000);
      }
    }

    makeTodos(task) {
      const p = this.project;
      const items = [];
      if (/fix|leak|flaky|slow|crash|why/i.test(task)) items.push({ text: 'Reproduce the issue', k: 'explore' });
      items.push({ text: fill('Locate {fn} and its call sites', p), k: 'explore' });
      const nEdit = this.model.id === 'haiku' ? 1 : R.int(1, this.model.id === 'fable' ? 3 : 2);
      for (let i = 0; i < nEdit; i++) items.push({ text: fill(R.pick(['Implement change in {file}', 'Refactor {fn}', 'Update {module} call sites', 'Add error handling to {fn}']), p), k: 'edit' });
      if (/test|coverage/i.test(task) || R.chance(0.5)) items.push({ text: 'Add tests for the new behavior', k: 'newtest' });
      if (/doc|readme/i.test(task)) items.push({ text: 'Update README / docs', k: 'docs' });
      items.push({ text: 'Run tests and lint', k: 'test' });
      return items;
    }

    /* ---------- an episode: one user request → full agent turn ---------- */
    async episode(task) {
      const p = this.project, m = this.model, L = this.L;
      this.turns++;
      this.spin();
      await this.hold(500 + 500 * m.think);
      if (/^(ok )?ship it|commit/i.test(task)) return this.commitFlow(task);
      if (/run the full suite/i.test(task)) { await this.runTests(false); return this.summary(task, true); }

      await this.think(1);
      const todos = this.makeTodos(task);

      if (this.mode === 'plan') {
        await this.planBox(task, todos);
      } else {
        await this.say(fill(R.pick(SAYS.intro), p));
      }
      await this.todos(todos, -1);

      let i = 0;
      for (const t of todos) {
        if (i > 0) await this.todos(todos, i);
        if (t.k === 'explore') {
          const n = R.int(1, 3) + (m.id === 'fable' ? 1 : 0);
          for (let j = 0; j < n; j++) await R.pick([() => this.grep(), () => this.read(R.pick(p.files)), () => this.glob(), () => this.read(R.pick(p.files))])();
          if ((m.id === 'opus' || m.id === 'fable') && i === 0 && R.chance(m.id === 'fable' ? 0.6 : 0.35)) await this.subagents();
          if (m.id !== 'haiku' && R.chance(0.15)) await this.webSearch();
          if (i === 0) { await this.think(0.6); await this.say(fill(R.pick(SAYS.found), p)); }
        } else if (t.k === 'edit') {
          const file = R.pick(p.files);
          await this.say(fill(R.pick(SAYS.edit), p).replace(/\{file\}|[\w/.-]+\.(ts|tsx|py|rs|go)/, file));
          if (this.mode === 'default') await this.permission('Edit file', file, 'Apply changes to ' + file);
          await this.edit(file);
          if (R.chance(0.3)) await this.edit(R.pick(p.files));
          if (R.chance(0.2)) {
            const pkg = R.pick(L.pkgs);
            const cmd = L.installCmd(pkg);
            await this.permission('Bash command', cmd, 'Install ' + pkg.split(' ')[0]);
            await this.bash(cmd, L.install(pkg), true, 2200);
          }
        } else if (t.k === 'newtest') {
          const tf = p.tests.find((x) => /\.(ts|tsx|py)$/.test(x)) || p.files[0];
          if (R.chance(0.5)) await this.write(tf.replace(/(\.\w+)$/, '_new$1').replace('_new', R.pick(['_edge', '_regression', '_props'])));
          else await this.edit(tf);
        } else if (t.k === 'docs') {
          await this.edit('README.md');
        } else if (t.k === 'test') {
          await this.runTests(true);
          if (R.chance(0.6)) {
            const lint = { ts: 'npx eslint src --fix', tsx: 'npx eslint src --fix', py: 'uv run ruff check --fix .', rs: 'cargo clippy -- -D warnings', go: 'golangci-lint run' }[p.lang];
            await this.bash(lint, L.lint(), true, 1600);
          }
          if (R.chance(0.3)) {
            const build = { ts: 'npm run build', tsx: 'npm run build', py: 'uv build', rs: 'cargo build --release', go: 'go build ./...' }[p.lang];
            await this.bash(build, L.build(), true, 2600);
          }
        }
        i++;
      }
      await this.todos(todos, Infinity);
      await this.summary(task);
    }

    async planBox(task, todos) {
      await this.say('Let me research before proposing a plan.');
      for (let j = 0; j < R.int(2, 3); j++) await this.read(R.pick(this.project.files));
      this.spinStop(); this.setState('waiting');
      const box = this.add(el('div', 'plan'));
      box.innerHTML = `<div class="pt">Ready to code?</div><div>Here is the plan for: <b>${esc(task)}</b></div>` +
        todos.map((t, i) => `<div>  ${i + 1}. ${esc(t.text)}</div>`).join('');
      await this.hold(3200);
      this.sys('<span class="el">⎿</span>  User approved the plan');
      this.mode = 'accept'; this.renderMode(); this.spin();
    }

    async commitFlow(task) {
      const p = this.project;
      await this.bash('git status --short', p.files.slice(0, R.int(2, 4)).map((f) => ' M ' + f), true, 600);
      await this.bash('git diff --stat', [...p.files.slice(0, 3).map((f) => ` ${f} | ${R.int(2, 60)} ${'+'.repeat(R.int(2, 9))}${'-'.repeat(R.int(0, 4))}`), ` 3 files changed, ${R.int(10, 140)} insertions(+), ${R.int(1, 40)} deletions(-)`], true, 700);
      const msg = commitMsg(this.lastTask || task);
      await this.permission('Bash command', `git commit -m "${msg}"`, 'Commit staged changes');
      await this.bash(`git add -A && git commit -m "${msg}"`, [`[${p.branch} ${Math.random().toString(16).slice(2, 9)}] ${msg}`, ` ${R.int(2, 6)} files changed, ${R.int(10, 140)} insertions(+), ${R.int(1, 40)} deletions(-)`], true, 1200);
      if (/ship/i.test(task)) await this.bash(`git push -u origin ${p.branch}`, [`To github.com:acme/${p.name}.git`, ` * [new branch]      ${p.branch} -> ${p.branch}`], true, 1800);
      await this.say(`Committed${/ship/i.test(task) ? ' and pushed' : ''} on \`${p.branch}\`.`);
    }

    async summary(task, short) {
      const p = this.project;
      this.lastTask = task;
      if (short) { await this.say('All green. Nothing else to change.'); return; }
      const files = R.sample(p.files, R.int(2, 3));
      const lines = [R.pick(['Done.', 'All set.', 'Finished.', 'Done — tests pass.']) + ' Summary of changes:', ''];
      files.forEach((f) => lines.push(`- **${f}**: ` + R.pick(['extracted side effects into a pure helper', 'added input validation and clearer errors', 'replaced the ad-hoc loop with a bounded retry', 'removed shared mutable state', 'added caching with explicit TTL'])));
      lines.push(`- Tests: **${R.int(30, 140)} passed**, 0 failed`);
      if (this.model.id !== 'haiku' && R.chance(0.6)) lines.push('', R.pick(['One follow-up worth considering: the `' + R.pick(p.modules) + '` still does too much and could be split.', 'Note: I kept the public API unchanged, so no callers need updating.', 'I did not touch the deploy config — that seemed out of scope.']));
      await this.say(lines.join('\n'));
    }

    async compact() {
      this.spin('Compacting conversation');
      await this.hold(3500);
      this.term.innerHTML = '';
      this.sys('<span class="el">⎿</span>  Conversation compacted · ctrl+o for history');
      this.ctxUsed = R.int(10, 20); this.useCtx(0);
      this.spinStop();
    }

    banner() {
      const b = el('div', 'banner');
      b.innerHTML = `<div class="t"><b>✻</b> Welcome to <b>Alarping</b>!</div><div class="d">  /help for help, /status for your current setup</div><div class="d">  cwd: C:\\Users\\dev\\projects\\${esc(this.project.name)}</div><div class="d">  model: ${this.model.name}</div>`;
      this.add(b);
    }

    async typeUser(text, animate = true) {
      if (animate && document.activeElement !== this.input && !this.input.value) {
        this.typing = true;
        for (let i = 0; i < text.length; i++) {
          this.input.value = text.slice(0, i + 1);
          await this.sleep(R.int(25, 75) / this.model.speed);
        }
        await this.sleep(350);
        this.input.value = '';
        this.typing = false;
      }
      this.add(el('div', 'm user', esc(text)));
      this.useCtx(0.3);
    }

    /* ---------- user interaction ---------- */
    userSubmit(text) {
      if (text.startsWith('/')) return this.slash(text);
      this.add(el('div', 'm user', esc(text)));
      if (this.waitingInput) { const r = this.waitingInput; this.waitingInput = null; r(text); return; }
      this.queue.push(text);
      if (this.state !== 'idle') this.interrupt = 'redirect';
      else this.interrupt = 'redirect';
    }
    slash(cmd) {
      const [c, arg] = cmd.split(/\s+/);
      this.add(el('div', 'm user', esc(cmd)));
      if (c === '/clear') { this.term.innerHTML = ''; this.ctxUsed = 5; this.useCtx(0); this.banner(); return; }
      if (c === '/compact') { this.queue.unshift('__compact'); this.interrupt = 'redirect'; return; }
      if (c === '/cost') { this.sys(`Total cost: $${(this.tokens * this.model.rate / 1e6 * 1.6).toFixed(4)}\nTotal tokens: ${fmtK(this.tokens)}\nTotal duration (wall): ${Math.floor(performance.now() / 60000)}m`); return; }
      if (c === '/model' && arg && MODELS[arg.toLowerCase()]) { this.switchModel(arg.toLowerCase()); return; }
      if (c === '/status') { this.sys(`Model: ${this.model.name}\ncwd: ~/projects/${esc(this.project.name)}\nBranch: ${esc(this.project.branch)}\nContext left: ${Math.round(this.ctxLeft())}%`); return; }
      this.sys('Commands: /clear · /compact · /cost · /status · /model fable|opus|sonnet|haiku');
    }
    switchModel(id) {
      this.model = MODELS[id]; this.root.dataset.model = id;
      $('.model', this.root).textContent = this.model.name;
      const tier = $('.tier', this.root); if (tier) tier.remove();
      if (this.model.tier) $('.model', this.root).insertAdjacentHTML('afterend', `<span class="tier">${this.model.tier.toUpperCase()}</span>`);
      this.sys(`<span class="el">⎿</span>  Set model to <b>${this.model.name}</b>`);
      refreshStatus();
    }
    esc() { if (!this.waitingInput && !this.dead) this.interrupt = 'stop'; }
    togglePause() {
      this.paused = !this.paused; this.root.classList.toggle('paused', this.paused);
      $('.bp', this.root).textContent = this.paused ? '▶' : '⏸'; this.setState(this.state);
    }
    kill() {
      this.dead = true; this.root.remove();
      G.agents = G.agents.filter((a) => a !== this);
      if (G.maxId === this.id) G.maxId = null;
      if (G.focusId === this.id) G.focusId = G.agents.length ? G.agents[G.agents.length - 1].id : null;
      layout();
    }
    waitUser(ms) {
      return new Promise((resolve) => {
        this.waitingInput = resolve;
        (async () => { try { await this.sleep(ms); } catch (e) { /* ignore */ } if (this.waitingInput === resolve) { this.waitingInput = null; resolve(null); } })();
      });
    }

    /* ---------- main loop ---------- */
    async loop() {
      try {
        await this.sleep(200);
        this.banner();
        this.useCtx(0);
        await this.sleep(R.int(600, 1600));
        let task = this.firstTask || fill(R.pick(TASKS), this.project);
        let needType = true;
        for (;;) {
          try {
            if (needType) { needType = false; await this.typeUser(task); }
            if (task === '__compact') await this.compact();
            else await this.episode(task);
            if (this.ctxLeft() < 8) { this.sys('Context low — auto-compacting…'); await this.compact(); }
            this.spinStop(); this.setState('idle');
            await this.sleep(R.int(2500, 8000));
            if (this.queue.length) { task = this.queue.shift(); continue; }
            task = R.chance(0.45) ? fill(R.pick(FOLLOWUPS), this.project) : fill(R.pick(TASKS), this.project);
            needType = true;
          } catch (e) {
            if (e !== INTERRUPT) throw e;
            const kind = this.interrupt; this.interrupt = null;
            if (this.typing) { this.input.value = ''; this.typing = false; }
            needType = false;
            this.spinStop();
            this.root.querySelectorAll('.m.tool:not(.ok):not(.bad)').forEach((n) => n.classList.add('bad'));
            if (kind === 'redirect' && this.queue.length) {
              task = this.queue.shift();
              if (task !== '__compact' && this.state !== 'idle') await this.say(R.pick(['Got it — switching to that now.', 'Understood, adjusting the plan.', 'Sure, on it.']));
              continue;
            }
            this.sys('<span class="el">⎿</span>  Interrupted by user · What should the agent do instead?', 'err');
            this.setState('waiting');
            const reply = await this.waitUser(15000);
            task = reply || this.queue.shift() || fill(R.pick(TASKS), this.project);
            needType = !reply;
          }
        }
      } catch (e) {
        if (e !== KILL) console.error(e);
      }
    }
  }

  function colorize(l) {
    // lines may contain <b> tags from our own templates; escape everything else
    let s = /<b>/.test(l) ? l : esc(l);
    if (/✓|passed|^ok\b|test result: ok|ok\s{2}|All checks passed|0 issues|found 0 vulnerabilities|Successfully|Finished/.test(l)) s = `<span class="grn">${s}</span>`;
    else if (/FAIL|×|failed|panicked|Error|error:/.test(l)) s = `<span class="red">${s}</span>`;
    return s;
  }

  function pickProject(name, custom) {
    if (custom && custom.trim()) {
      const base = R.pick(PROJECTS);
      return Object.assign({}, base, { name: custom.trim().replace(/\s+/g, '-').toLowerCase(), branch: R.pick(['main', 'dev', 'feat/' + R.pick(['wip', 'v2', 'turbo'])]) });
    }
    if (name && name !== 'random') return PROJECTS.find((p) => p.name === name) || R.pick(PROJECTS);
    const used = new Set(G.agents.map((a) => a.project.name));
    const free = PROJECTS.filter((p) => !used.has(p.name));
    return R.pick(free.length ? free : PROJECTS);
  }

  /* ====================================================================== */
  function spawn(modelId, opts) {
    if (G.agents.length >= MAX_AGENTS) { flash(`Máximo de ${MAX_AGENTS} agentes — calma, general.`); return; }
    const a = new Agent(modelId, opts);
    G.agents.push(a);
    setFocus(a.id);
    if (G.maxId) G.maxId = null;
    layout();
  }
  function layout() {
    const n = G.agents.length;
    $('#empty').hidden = n > 0;
    const w = grid.clientWidth || window.innerWidth;
    let cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
    if (w < 1000 && cols > 2) cols = 2;
    if (n === 3 && w > 1500) cols = 3;
    grid.style.setProperty('--cols', cols);
    grid.classList.toggle('has-max', !!G.maxId);
    G.agents.forEach((a) => { a.root.classList.toggle('max', a.id === G.maxId); a.root.classList.toggle('small', n > 6 && !G.maxId); a.scroll(); });
    refreshStatus();
  }
  function toggleMax(id) { G.maxId = G.maxId === id ? null : id; layout(); }
  function setFocus(id) {
    G.focusId = id;
    G.agents.forEach((a) => a.root.classList.toggle('focus', a.id === id));
  }
  const focused = () => G.agents.find((a) => a.id === G.focusId);

  function refreshStatus() {
    const n = G.agents.length;
    const working = G.agents.filter((a) => a.state === 'working' && !a.paused).length;
    const waiting = G.agents.filter((a) => a.state === 'waiting').length;
    $('#sb-agents').textContent = n ? `● ${n} agente${n > 1 ? 's' : ''} · ${working} trabalhando · ${waiting} aguardando · ${n - working - waiting} ocioso${n - working - waiting === 1 ? '' : 's'}` : '○ 0 agentes';
    $('#sb-tokens').textContent = `↓ ${fmtK(G.tokens)} tokens · US$ ${G.cost.toFixed(2)} (de mentirinha)`;
    const wEl = $('#sb-windows');
    if (G.windowCount > 1) { wEl.hidden = false; wEl.textContent = `⊞ ${G.windowCount} janelas`; } else { wEl.hidden = true; }
    const d = new Date();
    $('#sb-clock').textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  let toastT;
  function flash(msg) {
    let t = $('#toast');
    if (!t) { t = el('div'); t.id = 'toast'; Object.assign(t.style, { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: '#1e1e1e', border: '1px solid #3a3a3a', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', zIndex: 60 }); document.body.append(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => (t.style.display = 'none'), 2200);
  }

  /* ---------- global tick ---------- */
  let last = performance.now(), sbAcc = 0;
  setInterval(() => {
    const now = performance.now(), dt = now - last; last = now;
    G.agents.forEach((a) => a.tick(dt));
    sbAcc += dt; if (sbAcc > 500) { sbAcc = 0; refreshStatus(); }
  }, 100);

  /* ---------- controls ---------- */
  document.querySelectorAll('.spawn').forEach((b) => b.addEventListener('click', () => spawn(b.dataset.model, {})));
  const modal = $('#modal'), form = $('#new-form');
  const projSel = $('#f-project');
  projSel.innerHTML = '<option value="random">🎲 aleatório</option>' + PROJECTS.map((p) => `<option value="${p.name}">${p.name} (${p.lang})</option>`).join('');
  function openModal() { modal.hidden = false; setTimeout(() => form.task.focus(), 30); }
  function closeModal() { modal.hidden = true; }
  $('#btn-new').onclick = openModal;
  $('#btn-cancel').onclick = closeModal;
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const count = Math.max(1, Math.min(8, Number(fd.get('count')) || 1));
    for (let i = 0; i < count; i++) {
      spawn(fd.get('model'), { project: count > 1 && fd.get('project') === 'random' ? null : fd.get('project'), custom: fd.get('custom'), task: i === 0 ? fd.get('task') : '', mode: fd.get('mode') });
    }
    form.task.value = ''; form.custom.value = '';
    closeModal();
  });

  const btnPause = $('#btn-pause');
  function togglePauseAll() {
    G.paused = !G.paused;
    btnPause.textContent = G.paused ? '▶ Retomar' : '⏸ Pausar tudo';
    btnPause.classList.toggle('on', G.paused);
    document.body.classList.toggle('all-paused', G.paused);
    G.agents.forEach((a) => a.root.classList.toggle('paused', G.paused || a.paused));
  }
  btnPause.onclick = togglePauseAll;
  $('#speed').onchange = (e) => { G.speed = Number(e.target.value); };
  $('#btn-kill').onclick = () => { [...G.agents].forEach((a) => a.kill()); };

  function toggleFullscreen(on) {
    if (native) native.fullscreen(on);
    else if (on === false) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    else if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }
  $('#btn-fs').onclick = () => toggleFullscreen();

  function openNewWindow() {
    if (native) native.newWindow();
    else window.open(location.href, '_blank', 'width=1440,height=900');
  }
  $('#btn-window').onclick = openNewWindow;
  if (!native) $('#btn-window').title = 'Ctrl+Shift+N — abre outra janela do Alarping para arrastar para outro monitor (nova aba/janela do navegador)';
  if (native && native.onWindowCount) native.onWindowCount((n) => { G.windowCount = n; refreshStatus(); });

  let idleT;
  function setSaver(on) {
    G.saver = on;
    document.body.classList.toggle('saver', on);
    $('#btn-saver').classList.toggle('on', on);
    if (native) native.keepAwake(on);
    toggleFullscreen(on);
    if (on) flash('Modo protetor — Esc ou F10 para sair');
    poke();
    setTimeout(layout, 300);
  }
  function poke() {
    document.body.classList.remove('idle-cursor');
    clearTimeout(idleT);
    if (G.saver) idleT = setTimeout(() => document.body.classList.add('idle-cursor'), 2500);
  }
  document.addEventListener('mousemove', poke);
  $('#btn-saver').onclick = () => setSaver(!G.saver);

  document.addEventListener('keydown', (e) => {
    const inInput = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!modal.hidden) { if (e.key === 'Escape') closeModal(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openNewWindow(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openModal(); return; }
    if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); spawn(['fable', 'opus', 'sonnet', 'haiku'][Number(e.key) - 1], {}); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); const f = focused(); if (f) f.kill(); return; }
    if (e.key === 'F10') { e.preventDefault(); setSaver(!G.saver); return; }
    if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
    if (e.key === 'F12' && native) { native.devtools(); return; }
    if (e.key === 'Escape') {
      if (G.saver) { setSaver(false); return; }
      if (G.maxId) { toggleMax(G.maxId); return; }
      const f = focused(); if (f) f.esc(); return;
    }
    if (inInput) return;
    if (e.key === ' ') { e.preventDefault(); togglePauseAll(); return; }
    if (e.key === 'Tab' && G.agents.length) {
      e.preventDefault();
      const i = G.agents.findIndex((a) => a.id === G.focusId);
      setFocus(G.agents[(i + (e.shiftKey ? -1 : 1) + G.agents.length) % G.agents.length].id);
      if (G.maxId) { G.maxId = G.focusId; layout(); }
    }
  });
  if (native) native.onFullscreen((v) => { if (!v && G.saver) { G.saver = false; document.body.classList.remove('saver', 'idle-cursor'); $('#btn-saver').classList.remove('on'); native.keepAwake(false); } setTimeout(layout, 200); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && G.saver) setSaver(false); });
  window.addEventListener('resize', () => layout());

  layout();
  window.__alarp = { G, spawn };
})();
