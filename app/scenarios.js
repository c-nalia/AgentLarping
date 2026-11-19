/* Alarping — content engine: projects, tasks, code, tool output. All fake. */
(function () {
  const R = {
    pick: (a) => a[Math.floor(Math.random() * a.length)],
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    shuffle: (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    sample: (a, n) => R.shuffle(a).slice(0, n),
  };

  const MODELS = {
    fable:  { id: 'fable',  name: 'Fable 5.2',  short: 'Fable',  color: '#c3a0ff', speed: 0.8,  think: 1.7, rate: 75, ctxK: 1000, tier: 'Mythos' },
    opus:   { id: 'opus',   name: 'Opus 5.5',   short: 'Opus',   color: '#e3895f', speed: 1.0,  think: 1.3, rate: 25, ctxK: 500 },
    sonnet: { id: 'sonnet', name: 'Sonnet 5.5', short: 'Sonnet', color: '#7cb7ff', speed: 1.3,  think: 1.0, rate: 15, ctxK: 500 },
    haiku:  { id: 'haiku',  name: 'Haiku 5.5',  short: 'Haiku',  color: '#68d9a4', speed: 1.9,  think: 0.5, rate: 4,  ctxK: 200 },
  };

  const VERBS = ['Thinking', 'Pondering', 'Cogitating', 'Percolating', 'Noodling', 'Mulling', 'Schlepping', 'Spelunking',
    'Finagling', 'Moseying', 'Ruminating', 'Brewing', 'Tinkering', 'Wrangling', 'Untangling', 'Conjuring', 'Simmering',
    'Marinating', 'Calibrating', 'Deliberating', 'Synthesizing', 'Herding', 'Vibing', 'Computing', 'Forging', 'Crafting'];

  /* ---------------- languages ---------------- */
  const LANGS = {
    ts: {
      snippets: [
        { ctx: ['export async function handler(req: Request, res: Response) {', '  const token = req.headers.authorization?.split(" ")[1];'],
          del: ['  const user = verify(token, SECRET);'],
          add: ['  const user = await tokens.verifyAndRotate(token, { leeway: 30 });', '  if (!user) return res.status(401).json({ error: "invalid_token" });'],
          post: ['  req.user = user;'] },
        { ctx: ['const cache = new Map<string, Entry>();', ''],
          del: ['export function get(key: string) {', '  return cache.get(key)?.value;'],
          add: ['export function get(key: string): unknown | undefined {', '  const hit = cache.get(key);', '  if (!hit || hit.expiresAt < Date.now()) { cache.delete(key); return undefined; }', '  return hit.value;'],
          post: ['}'] },
        { ctx: ['  const { page = 1, limit = 20 } = req.query;'],
          del: ['  const rows = await db.query("SELECT * FROM users");', '  return res.json(rows);'],
          add: ['  const offset = (Number(page) - 1) * Number(limit);', '  const rows = await db.query(sql`SELECT * FROM users ORDER BY id LIMIT ${limit} OFFSET ${offset}`);', '  return res.json({ data: rows, page: Number(page), next: rows.length === Number(limit) });'],
          post: ['}'] },
        { ctx: ['export async function withRetry<T>(fn: () => Promise<T>, attempts = 3) {'],
          del: ['  return fn();'],
          add: ['  for (let i = 0; ; i++) {', '    try { return await fn(); }', '    catch (err) {', '      if (i >= attempts - 1 || !isRetryable(err)) throw err;', '      await sleep(2 ** i * 100 + Math.random() * 50);', '    }', '  }'],
          post: ['}'] },
        { ctx: ['import { z } from "zod";', ''],
          del: ['const Config = (process.env as any);'],
          add: ['const Config = z.object({', '  PORT: z.coerce.number().default(3000),', '  DATABASE_URL: z.string().url(),', '  JWT_TTL: z.coerce.number().default(900),', '}).parse(process.env);'],
          post: ['', 'export default Config;'] },
      ],
      testPass: (p) => [`> ${p.name}@${p.ver} test`, '> vitest run', '', ...p.tests.map(t => ` ✓ ${t} (${R.int(4, 22)} tests) ${R.int(40, 320)}ms`), '', ` Test Files  ${p.tests.length} passed (${p.tests.length})`, `      Tests  ${R.int(40, 120)} passed`, `   Duration  ${(Math.random() * 3 + 1).toFixed(2)}s`],
      testFail: (p, name) => [`> ${p.name}@${p.ver} test`, '> vitest run', '', ` ❯ ${p.tests[0]} (14 tests | 1 failed)`, `   × ${name}`, `     AssertionError: expected 401 to be 200`, '', ` Test Files  1 failed | ${p.tests.length - 1} passed (${p.tests.length})`],
      build: () => ['> tsc -p tsconfig.json && vite build', `vite v6.${R.int(0, 3)}.${R.int(0, 9)} building for production...`, `✓ ${R.int(120, 900)} modules transformed.`, `dist/index.js  ${R.int(80, 400)}.${R.int(10, 99)} kB │ gzip: ${R.int(20, 90)}.${R.int(10, 99)} kB`, `✓ built in ${(Math.random() * 4 + 1).toFixed(2)}s`],
      lint: () => [`✔ ${R.int(0, 3) ? 'No problems found' : R.int(2, 9) + ' problems fixed automatically'}`],
      install: (pkg) => [`added ${R.int(1, 14)} packages, and audited ${R.int(300, 900)} packages in ${R.int(2, 9)}s`, 'found 0 vulnerabilities'],
      pkgs: ['zod@latest', 'pino', 'ioredis', 'p-retry', 'undici', '@types/node -D', 'vitest -D'],
      installCmd: (x) => `npm install ${x}`,
    },
    py: {
      snippets: [
        { ctx: ['def load_dataset(path: Path) -> pd.DataFrame:'],
          del: ['    df = pd.read_csv(path)', '    return df.dropna()'],
          add: ['    df = pd.read_csv(path, dtype={"composition": "string"})', '    df = df.dropna(subset=["target"])', '    log.info("loaded %d rows from %s", len(df), path.name)', '    return df.reset_index(drop=True)'],
          post: [''] },
        { ctx: ['class FeatureBuilder:', '    def __init__(self, cfg: Config):'],
          del: ['        self.cache = {}'],
          add: ['        self.cache: dict[str, np.ndarray] = {}', '        self._lock = threading.Lock()'],
          post: ['        self.cfg = cfg'] },
        { ctx: ['    for epoch in range(cfg.epochs):'],
          del: ['        loss = train_step(model, batch)'],
          add: ['        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):', '            loss = train_step(model, batch)', '        scaler.scale(loss).backward()'],
          post: ['        sched.step()'] },
        { ctx: ['@app.get("/jobs/{job_id}")', 'async def get_job(job_id: str):'],
          del: ['    return jobs[job_id]'],
          add: ['    job = await repo.get(job_id)', '    if job is None:', '        raise HTTPException(status_code=404, detail="job not found")', '    return JobOut.model_validate(job)'],
          post: [''] },
        { ctx: ['def split(df, seed=42):'],
          del: ['    return train_test_split(df, test_size=0.2, random_state=seed)'],
          add: ['    groups = df["alloy_family"]', '    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed)', '    tr, te = next(gss.split(df, groups=groups))', '    return df.iloc[tr], df.iloc[te]'],
          post: [''] },
      ],
      testPass: (p) => [`============================= test session starts ==============================`, `platform win32 -- Python 3.13.${R.int(0, 3)}, pytest-8.${R.int(2, 4)}.0`, `collected ${R.int(30, 140)} items`, '', ...p.tests.map(t => `${t} ${'.'.repeat(R.int(6, 30))}`), '', `============================== ${R.int(30, 140)} passed in ${(Math.random() * 6 + 1).toFixed(2)}s ==============================`],
      testFail: (p, name) => [`collected ${R.int(30, 140)} items`, '', `${p.tests[0]} ....F.....`, '', `FAILED ${p.tests[0]}::${name} - AssertionError: assert 0.81 > 0.85`, `========================= 1 failed, ${R.int(30, 90)} passed in 4.0${R.int(1, 9)}s =========================`],
      build: () => ['* Building wheel...', `Successfully built ${'pkg'}-${R.int(0, 2)}.${R.int(1, 9)}.0-py3-none-any.whl`],
      lint: () => [R.chance(0.6) ? 'All checks passed!' : `Found ${R.int(2, 8)} errors (${R.int(2, 8)} fixed, 0 remaining).`],
      install: () => [`Resolved ${R.int(20, 80)} packages in ${R.int(100, 900)}ms`, `Installed ${R.int(1, 6)} packages in ${R.int(20, 300)}ms`],
      pkgs: ['httpx', 'polars', 'pydantic-settings', 'tenacity', 'rich', 'pytest-xdist'],
      installCmd: (x) => `uv add ${x}`,
    },
    rs: {
      snippets: [
        { ctx: ['impl MemTable {', '    pub fn insert(&mut self, key: Bytes, value: Bytes) {'],
          del: ['        self.map.insert(key, value);'],
          add: ['        self.size_bytes += key.len() + value.len();', '        self.map.insert(key, Value::Put(value));', '        if self.size_bytes >= self.flush_threshold {', '            self.frozen = true;', '        }'],
          post: ['    }'] },
        { ctx: ['pub async fn handle(conn: &mut Conn) -> Result<()> {'],
          del: ['    let frame = conn.read_frame().await.unwrap();'],
          add: ['    let Some(frame) = conn.read_frame().await? else {', '        tracing::debug!("peer closed connection");', '        return Ok(());', '    };'],
          post: ['    dispatch(frame, conn).await'] },
        { ctx: ['fn merge_runs(runs: Vec<Run>) -> Run {'],
          del: ['    runs.into_iter().flatten().collect()'],
          add: ['    let mut heap = BinaryHeap::with_capacity(runs.len());', '    for (i, r) in runs.iter().enumerate() { if let Some(e) = r.first() { heap.push(Reverse((e.key.clone(), i))); } }', '    kway_merge(heap, runs)'],
          post: ['}'] },
        { ctx: ['#[derive(Debug, Error)]', 'pub enum StoreError {'],
          del: ['    Io(std::io::Error),'],
          add: ['    #[error("io: {0}")]', '    Io(#[from] std::io::Error),', '    #[error("corrupt segment {id} at offset {offset}")]', '    Corrupt { id: u64, offset: u64 },'],
          post: ['}'] },
      ],
      testPass: (p) => [`   Compiling ${p.name} v${p.ver}`, `    Finished \`test\` profile [unoptimized + debuginfo] in ${(Math.random() * 9 + 2).toFixed(2)}s`, `     Running unittests src/lib.rs`, '', `running ${R.int(18, 60)} tests`, ...p.tests.map(t => `test ${t} ... ok`), '', `test result: ok. ${R.int(18, 60)} passed; 0 failed; 0 ignored; finished in ${(Math.random()).toFixed(2)}s`],
      testFail: (p, name) => [`running ${R.int(18, 60)} tests`, `test ${name} ... FAILED`, '', 'failures:', `---- ${name} stdout ----`, `thread '${name}' panicked at src/storage/lsm.rs:${R.int(80, 300)}:9:`, 'assertion `left == right` failed', '', `test result: FAILED. ${R.int(18, 60)} passed; 1 failed; 0 ignored`],
      build: () => [`   Compiling ${'tokio'} v1.4${R.int(0, 9)}.0`, `   Compiling ${R.pick(['ferris-kv', 'crate'])} v0.${R.int(1, 9)}.0`, `    Finished \`release\` profile [optimized] target(s) in ${R.int(12, 70)}.${R.int(10, 99)}s`],
      lint: () => [`    Checking ${'crate'} v0.${R.int(1, 9)}.0`, `    Finished \`dev\` profile in ${(Math.random() * 3 + 1).toFixed(2)}s`],
      install: () => [`    Updating crates.io index`, `      Adding ${R.pick(['thiserror', 'tracing', 'bytes', 'crc32fast'])} v${R.int(0, 2)}.${R.int(1, 30)}.${R.int(0, 9)} to dependencies`],
      pkgs: ['thiserror', 'tracing', 'bytes', 'crc32fast', 'proptest --dev'],
      installCmd: (x) => `cargo add ${x}`,
    },
    go: {
      snippets: [
        { ctx: ['func (r *Router) Route(req *http.Request) (*Backend, error) {'],
          del: ['	b := r.backends[rand.Intn(len(r.backends))]', '	return b, nil'],
          add: ['	healthy := r.healthy()', '	if len(healthy) == 0 {', '		return nil, ErrNoBackends', '	}', '	return healthy[r.next.Add(1)%uint64(len(healthy))], nil'],
          post: ['}'] },
        { ctx: ['func (c *Checker) Run(ctx context.Context) {'],
          del: ['	for {', '		c.probeAll()', '		time.Sleep(c.interval)'],
          add: ['	t := time.NewTicker(c.interval)', '	defer t.Stop()', '	for {', '		select {', '		case <-ctx.Done():', '			return', '		case <-t.C:', '			c.probeAll(ctx)', '		}'],
          post: ['	}', '}'] },
        { ctx: ['	conn, err := net.Dial("tcp", addr)'],
          del: ['	if err != nil { panic(err) }'],
          add: ['	if err != nil {', '		return fmt.Errorf("dial %s: %w", addr, err)', '	}'],
          post: ['	defer conn.Close()'] },
      ],
      testPass: (p) => p.tests.map(t => `ok  	github.com/acme/${p.name}/${t}	${(Math.random()).toFixed(3)}s`),
      testFail: (p, name) => [`--- FAIL: ${name} (0.0${R.int(1, 9)}s)`, `    router_test.go:${R.int(40, 140)}: expected 503, got 200`, 'FAIL', `FAIL	github.com/acme/${p.name}/${p.tests[0]}	0.${R.int(100, 900)}s`],
      build: () => [`go: downloading golang.org/x/sync v0.${R.int(5, 12)}.0`, ''],
      lint: () => [R.chance(0.6) ? '0 issues.' : `internal/proxy/conn.go:${R.int(10, 200)}:2: ineffectual assignment to err (ineffassign)`],
      install: () => [`go: added ${R.pick(['golang.org/x/sync', 'go.uber.org/zap', 'github.com/stretchr/testify'])} v1.${R.int(1, 12)}.0`],
      pkgs: ['go.uber.org/zap', 'golang.org/x/sync', 'github.com/stretchr/testify'],
      installCmd: (x) => `go get ${x}`,
    },
  };
  LANGS.tsx = Object.assign({}, LANGS.ts, {
    snippets: [
      { ctx: ['export function Toolbar({ tools, active, onSelect }: Props) {'],
        del: ['  return <div className="toolbar">{tools.map(t => <button onClick={() => onSelect(t)}>{t.name}</button>)}</div>;'],
        add: ['  return (', '    <div role="toolbar" className="toolbar" aria-label="Tools">', '      {tools.map(t => (', '        <button key={t.id} aria-pressed={t.id === active} onClick={() => onSelect(t.id)}>', '          <Icon name={t.icon} /> {t.name}', '        </button>', '      ))}', '    </div>', '  );'],
        post: ['}'] },
      { ctx: ['export function useHistory<T>(initial: T) {'],
        del: ['  const [stack, setStack] = useState([initial]);'],
        add: ['  const [state, dispatch] = useReducer(historyReducer<T>, { past: [], present: initial, future: [] });', '  const undo = useCallback(() => dispatch({ type: "undo" }), []);', '  const redo = useCallback(() => dispatch({ type: "redo" }), []);'],
        post: [''] },
      ...LANGS.ts.snippets.slice(1, 3),
    ],
  });
  LANGS.kt = {
    snippets: [
      { ctx: ['class AlarmReceiver : BroadcastReceiver() {', '    override fun onReceive(context: Context, intent: Intent) {'],
        del: ['        startAlarmSound(context)'],
        add: ['        val streak = ProgressStore.getStreak(context)', '        val difficulty = Difficulty.forStreak(streak)', '        startAlarmSound(context, difficulty)'],
        post: ['    }'] },
      { ctx: ['object QuestionBank {', '    fun generate(topic: Topic, difficulty: Difficulty): Question {'],
        del: ['        return questions.filter { it.topic == topic }.random()'],
        add: ['        val pool = questions.filter { it.topic == topic && it.difficulty == difficulty }', '        check(pool.isNotEmpty()) { "no questions for $topic/$difficulty" }', '        return pool.random()'],
        post: ['    }'] },
      { ctx: ['class ProgressStore(private val prefs: SharedPreferences) {', '    fun recordAnswer(correct: Boolean) {'],
        del: ['        if (correct) streak++ else streak = 0'],
        add: ['        if (correct) streak++ else streak = 0', '        if (streak >= PROMOTION_THRESHOLD) promote()', '        prefs.edit().putInt(KEY_STREAK, streak).apply()'],
        post: ['    }'] },
      { ctx: ['@Composable', 'fun QuizScreen(question: Question, onAnswer: (Boolean) -> Unit) {'],
        del: ['    Text(text = question.prompt)'],
        add: ['    LatexText(expression = question.prompt, modifier = Modifier.padding(16.dp))', '    if (question.isTruthTable) TruthTableView(question.table)'],
        post: ['    AnswerOptions(question.options, onAnswer)', '}'] },
    ],
    testPass: (p) => ['> Task :app:testDebugUnitTest', '', ...p.tests.map(t => `${t.split('.').pop()} PASSED`), '', `BUILD SUCCESSFUL in ${R.int(3, 14)}s`, `${R.int(18, 60)} actionable tasks: ${R.int(2, 8)} executed, ${R.int(10, 50)} up-to-date`],
    testFail: (p, name) => ['> Task :app:testDebugUnitTest FAILED', '', `${p.tests[0].split('.').pop()} > ${name} FAILED`, '    org.opentest4j.AssertionFailedError: expected: <true> but was: <false>', `        at ${p.tests[0].split('.').pop()}.${name}(${p.tests[0].split('.').pop()}.kt:${R.int(20, 140)})`, '', '1 test completed, 1 failed', '', 'FAILURE: Build failed with an exception.'],
    build: () => ['> Task :app:compileDebugKotlin', '> Task :app:assembleDebug', `BUILD SUCCESSFUL in ${R.int(8, 40)}s`],
    lint: () => [R.chance(0.6) ? '✅ ktlint: no violations found' : `app/src/main/java/.../QuizScreen.kt:${R.int(10, 140)}:5: Missing trailing comma (standard:trailing-comma-on-call-site)`],
    install: () => ['> Task :app:dependencies', `Resolved ${R.int(1, 4)} new artifacts`, `BUILD SUCCESSFUL in ${R.int(2, 9)}s`],
    pkgs: ['androidx.work:work-runtime-ktx:2.9.0', 'androidx.room:room-ktx:2.6.1', 'com.google.accompanist:accompanist-permissions:0.34.0', 'org.jetbrains.kotlinx:kotlinx-coroutines-test'],
    installCmd: () => './gradlew build --refresh-dependencies',
  };

  /* ---------------- projects ---------------- */
  const PROJECTS = [
    { name: 'nebula-api', lang: 'ts', ver: '2.4.0', branch: 'feat/token-rotation',
      files: ['src/auth/middleware.ts', 'src/auth/jwt.ts', 'src/routes/users.ts', 'src/routes/billing.ts', 'src/db/pool.ts', 'src/lib/cache.ts', 'src/lib/retry.ts', 'src/config.ts', 'src/server.ts'],
      tests: ['tests/auth.test.ts', 'tests/users.test.ts', 'tests/cache.test.ts', 'tests/billing.test.ts'],
      fns: ['verifyToken', 'loadUser', 'withRetry', 'paginate', 'createPool', 'invalidate', 'parseConfig', 'rateLimit'],
      modules: ['auth', 'billing', 'cache layer', 'db pool', 'config loader'] },
    { name: 'pixel-forge', lang: 'tsx', ver: '0.9.3', branch: 'main',
      files: ['src/components/Canvas.tsx', 'src/components/Toolbar.tsx', 'src/components/LayerPanel.tsx', 'src/hooks/useHistory.ts', 'src/store/layers.ts', 'src/lib/blend.ts', 'vite.config.ts'],
      tests: ['src/__tests__/history.test.ts', 'src/__tests__/blend.test.ts', 'src/__tests__/layers.test.tsx'],
      fns: ['useHistory', 'applyBlend', 'renderLayer', 'commitStroke', 'hitTest', 'exportPng'],
      modules: ['layer store', 'canvas renderer', 'undo history', 'toolbar', 'blend modes'] },
    { name: 'arvore-de-grade', lang: 'tsx', ver: '0.4.0', branch: 'feat/optativas-bcc',
      files: ['src/components/GradeTree.tsx', 'src/components/CourseNode.tsx', 'src/data/bcc_curriculum.json', 'src/data/bsi_curriculum.json', 'src/lib/buildTree.ts', 'src/lib/optativas.ts', 'vite.config.ts'],
      tests: ['src/__tests__/buildTree.test.ts', 'src/__tests__/optativas.test.ts'],
      fns: ['buildTree', 'resolvePrerequisites', 'loadCurriculum', 'renderNode', 'sortOptativas'],
      modules: ['curriculum loader', 'tree builder', 'optativas table', 'node renderer'] },
    { name: 'crumbswaze', lang: 'tsx', ver: '0.2.0', branch: 'feat/weighted-edges',
      files: ['src/components/GraphCanvas.tsx', 'src/components/ToolDrawer.tsx', 'src/components/BrainPanel.tsx', 'src/graph/bfs.ts', 'src/graph/dfs.ts', 'src/graph/Node.ts', 'src/graph/Edge.ts'],
      tests: ['src/__tests__/bfs.test.ts', 'src/__tests__/dfs.test.ts', 'src/__tests__/graph.test.ts'],
      fns: ['addNode', 'addEdge', 'runBFS', 'runDFS', 'computeWeight', 'renderTrail'],
      modules: ['graph store', 'BFS/DFS tools', 'tool drawer', 'canvas renderer'] },
    { name: 'remindyouhub', lang: 'py', ver: '0.6.0', branch: 'feat/manga-support',
      files: ['remindyouhub/db.py', 'remindyouhub/shelf.py', 'remindyouhub/ui/grid_view.py', 'remindyouhub/ui/item_card.py', 'remindyouhub/importers/mal_import.py', 'remindyouhub/models.py'],
      tests: ['tests/test_db.py', 'tests/test_shelf.py', 'tests/test_models.py'],
      fns: ['add_item', 'mark_watched', 'load_shelf', 'migrate_db', 'scan_covers'],
      modules: ['local db', 'shelf grid', 'item cards', 'importer', 'cover cache'] },
    { name: 'wakeup-quiz', lang: 'kt', ver: '0.5.0', branch: 'feat/dificuldade-dificil',
      files: ['app/src/main/java/com/chris/wakeupquiz/alarm/AlarmReceiver.kt', 'app/src/main/java/com/chris/wakeupquiz/quiz/QuestionBank.kt', 'app/src/main/java/com/chris/wakeupquiz/quiz/Difficulty.kt', 'app/src/main/java/com/chris/wakeupquiz/ui/QuizScreen.kt', 'app/src/main/java/com/chris/wakeupquiz/data/ProgressStore.kt', 'app/build.gradle.kts'],
      tests: ['app/src/test/java/com/chris/wakeupquiz/QuestionBankTest.kt', 'app/src/test/java/com/chris/wakeupquiz/DifficultyTest.kt', 'app/src/androidTest/java/com/chris/wakeupquiz/AlarmReceiverTest.kt'],
      fns: ['scheduleAlarm', 'generateQuestion', 'checkAnswer', 'promoteDifficulty', 'dismissAlarm'],
      modules: ['alarm scheduler', 'question bank', 'difficulty ladder', 'quiz screen', 'progress store'] },
    { name: 'ferris-kv', lang: 'rs', ver: '0.7.2', branch: 'perf/compaction',
      files: ['src/storage/lsm.rs', 'src/storage/memtable.rs', 'src/storage/sstable.rs', 'src/wal.rs', 'src/server/conn.rs', 'src/error.rs', 'Cargo.toml'],
      tests: ['storage::lsm::tests::flush_on_threshold', 'storage::sstable::tests::roundtrip', 'wal::tests::replay_after_crash', 'server::tests::pipelined_requests'],
      fns: ['merge_runs', 'insert', 'handle', 'replay', 'compact', 'flush'],
      modules: ['memtable', 'compaction', 'WAL', 'connection handler', 'error types'] },
    { name: 'gopher-mesh', lang: 'go', ver: '1.12.0', branch: 'fix/health-checks',
      files: ['cmd/meshd/main.go', 'internal/router/router.go', 'internal/proxy/conn.go', 'internal/health/check.go', 'internal/config/config.go', 'go.mod'],
      tests: ['internal/router', 'internal/proxy', 'internal/health', 'internal/config'],
      fns: ['Route', 'Run', 'probeAll', 'Dial', 'Load', 'healthy'],
      modules: ['router', 'health checker', 'proxy', 'config'] },
    { name: 'orbit-scheduler', lang: 'py', ver: '1.0.0', branch: 'feat/priorities',
      files: ['orbit/scheduler.py', 'orbit/queue.py', 'orbit/workers/pool.py', 'orbit/api/routes.py', 'orbit/settings.py'],
      tests: ['tests/test_scheduler.py', 'tests/test_queue.py', 'tests/test_api.py'],
      fns: ['schedule', 'enqueue', 'claim_next', 'heartbeat', 'get_job'],
      modules: ['scheduler', 'priority queue', 'worker pool', 'REST API'] },
  ];

  const TASKS = [
    'fix the flaky test in {test}',
    'add rate limiting to {file}',
    'refactor {file} to remove the global state',
    'add retries with exponential backoff to {fn}',
    'investigate why {module} is slow under load',
    'write tests for {fn}, coverage is terrible',
    'migrate the {module} to the new config system',
    'there is a memory leak somewhere in the {module}, find it',
    'add structured logging to the {module}',
    'implement pagination for the list endpoint',
    'clean up error handling in {file}',
    'bump dependencies and fix whatever breaks',
    'add a CI workflow that runs lint + tests',
    'document the public API of the {module}',
    'make {fn} handle empty input without crashing',
    'profile {fn} and make it at least 2x faster',
    'review the last commit and fix anything sketchy',
  ];

  const FOLLOWUPS = ['also add tests for that', 'nice. can you also update the README?', 'run the full suite again',
    'commit this with a good message', 'looks good, now do the same for {file}', 'wait, keep the old behavior behind a flag',
    'ok ship it', 'can you double check edge cases?'];

  const THOUGHTS = [
    'The {module} couples parsing with I/O, so any change here ripples into {file}. Better to isolate the side effects first and keep the public signature stable.',
    'Before touching {fn} I want to know every call site — if one of them relies on the current mutation behavior, a pure version would silently break it.',
    'Edge case: what happens when the input is empty or the upstream returns a partial response? The current code assumes at least one element.',
    'There are two plausible causes: a race between the writer and the flush, or a stale cache entry that never expires. The test only fails under parallel runs, which points to the race.',
    'I could add a lock, but that serializes the hot path. A cheaper option is to snapshot state before the await and validate it after.',
    'The user asked for a minimal change. I will avoid restructuring the module and only touch what is needed, then mention the larger refactor as a follow-up.',
    'Tests mock {fn} directly, which is why they never caught this. I should test through the public interface instead.',
    'Let me reconsider — the config value is read once at import time, so changing it at runtime does nothing. That explains the bug report.',
    'Measuring first: if {fn} is only 3% of the profile, optimizing it is pointless. The real cost is probably in serialization.',
    'Plan: reproduce, write a failing test, apply the fix, run the full suite, then lint. Keep the diff small and reviewable.',
    'Backoff should have jitter, otherwise every client retries at exactly the same moment and we just recreate the thundering herd.',
    'The error is swallowed two layers down, so callers see a generic failure. Wrapping it with context will make the logs actually useful.',
  ];

  const SAYS = {
    intro: ["I'll start by exploring how the {module} is structured.", "Let me look at the relevant code first.",
      "I'll investigate this. First, let me find where {fn} is defined and used.", "Let me understand the current setup before changing anything."],
    found: ['Found it — {fn} is called on every request and never caches the result.', 'The issue is in {file}: errors are swallowed and the caller retries forever.',
      'I see the problem. The {module} reads config at import time, so overrides never apply.', "Got it. There's a race between the flush and the next write.",
      'The structure is clear now. {fn} does three things at once — I will split it.'],
    edit: ['Now let me update {file}.', 'Applying the fix.', "I'll make the change in {file}.", 'Next, updating the call sites.'],
    test: ['Let me run the tests to verify.', 'Running the test suite.', 'Checking that nothing else broke.'],
    failfix: ['One failure — the fixture still uses the old signature. Fixing it.', 'A test expects the old behavior. Updating the assertion, since the new behavior is the intended one.'],
    sub: ['This touches several areas. Let me dispatch subagents to explore in parallel.', "I'll split the investigation across parallel agents."],
  };

  const SUBTASKS = ['Map all call sites of {fn}', 'Audit error handling in {module}', 'Find tests touching {module}', 'Profile hot path in {file}', 'Check docs for outdated examples'];
  const SEARCHES = ['{fn} best practices 2026', '{module} race condition fix', 'exponential backoff jitter recommendation'];

  function fill(s, p) {
    return s.replace(/\{(\w+)\}/g, (_, k) => {
      if (k === 'file') return R.pick(p.files);
      if (k === 'test') return R.pick(p.tests);
      if (k === 'fn') return R.pick(p.fns);
      if (k === 'module') return R.pick(p.modules);
      return k;
    });
  }

  function commitMsg(task) {
    const t = task.replace(/\b(also|can you|please)\b/gi, '').trim();
    const type = /fix|leak|flaky|crash/i.test(t) ? 'fix' : /test/i.test(t) ? 'test' : /doc|readme/i.test(t) ? 'docs' : /refactor|clean/i.test(t) ? 'refactor' : 'feat';
    return `${type}: ${t.slice(0, 58)}`;
  }

  window.ALARP = { R, MODELS, VERBS, LANGS, PROJECTS, TASKS, FOLLOWUPS, THOUGHTS, SAYS, SUBTASKS, SEARCHES, fill, commitMsg };
})();
