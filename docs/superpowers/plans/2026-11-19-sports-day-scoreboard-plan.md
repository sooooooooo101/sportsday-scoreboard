# 体育祭 得点ボード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 青組と白組の得点を誰でもスマホでリアルタイムに見られる表示画面と、合言葉 1 つで得点係が試合ごとに点数を入力できる管理画面を作る。

**Architecture:** Vite のマルチページ構成で、表示画面（`/`）と管理画面（`/admin/`）を 1 つのアプリとして作り、Firebase Hosting で公開する。データは Firestore に保存し、両方の画面が `onSnapshot` で購読する。書き込めるのは、Firebase Authentication の得点係アカウント 1 つだけで、Firestore セキュリティルールでそれ以外を拒否する。

**Tech Stack:** Node 26 / Vite / React 18 / TypeScript (strict) / Firebase JS SDK v11 (firestore, auth) / motion（`motion/react`）/ Vitest / @testing-library/react / @firebase/rules-unit-testing / firebase-tools（devDependency、`npx firebase`）/ Firestore Emulator（Java 21 が必要）

**Spec:** `docs/2026-11-19-sports-day-scoreboard-design.md`

**Project root:** `~/projects/sportsday-scoreboard`（新しいリポジトリ。場所は着手前にユーザーに確認する）

## Global Constraints
- チームは `blue`（青）と `white`（白）の 2 つだけ
- 競技の初期データ（実施順）：A 借り人競走 4 試合 / B 玉入れ改 3 試合 / D 障害物リレー 1 試合 / C ドッジボール 2 試合 / E メンターリレー 2 試合
- 初期のよく使う点数：A なし / B なし / D [40,30,20,10] / C [40,25,10] / E [50,30]
- 各競技の `max` の初期値は 100。`capMode` の初期値は `"shared"`（青と白の合計で max まで）。もう 1 つの値は `"perTeam"`
- 点数は 0 以上の整数
- 隠す設定の初期値：`hideFromOrder = 5`（E）、`hidden = false`
- 書き込みは得点係 UID のみ。それ以外の書き込みはすべて拒否する
- 隠している競技のドキュメントは、未ログインでは読めない
- 表示画面はスマホ縦向きを基準にする（上が青、下が白）。幅が高さより大きいときは、左が青・右が白
- 数字のアニメーションは `bounce: 0`、`visualDuration: 0.4`。`prefers-reduced-motion: reduce` のときは即座に切り替える
- 画面の文言はすべて日本語
- 秘密情報（合言葉、UID 以外の認証情報）はリポジトリに入れない。Firebase の Web 設定は `.env.local`（gitignore）に置き、`.env.example` を用意する

## Review Focus
1. **隠している間の表示**：E を隠している間、表示画面に E の内訳と合計点が「?」で出ること。古い数字や 0 を表示しないこと（Task 4 のテストで固定する）
2. **全角数字やおかしな入力**：日本語入力のまま打たれた「４０」、空欄、「-5」、「12.5」、「1000」。全角は半角に直し、範囲外は理由を出して保存しないこと（Task 1 のテストで固定する）
3. **試合数を減らすとき**：点数が入っている試合が消える減らし方は、理由を表示して止めること。黙って点数が合計から消えないようにする（Task 1 と Task 5 のテストで固定する）
4. **通信が切れたとき**：表示画面は「再接続中」と出し、つながったら最新に戻ること。管理画面は 8 秒以内にサーバーの確認が取れなければ「未送信」と出し、入力した値を消さないこと（Task 4 と Task 5 のテストで固定する）
5. **2 人が同時に入力したとき**：試合 1 と試合 2 を同時に更新しても、互いの点数を消さないこと（Task 3 のエミュレーターテストで固定する）

---

### Task 1: プロジェクトの土台と点数計算ロジック

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `admin/index.html`, `.gitignore`, `.env.example`, `vitest.config.ts`
- Create: `src/shared/types.ts`, `src/shared/seed.ts`, `src/shared/scoring.ts`
- Test: `tests/scoring.test.ts`

**Interfaces:**
- Produces（`src/shared/types.ts`）:
  ```ts
  export type Team = 'blue' | 'white';
  export type CapMode = 'shared' | 'perTeam';
  export type MatchScore = { blue: number; white: number };
  export type Competition = {
    id: 'A' | 'B' | 'C' | 'D' | 'E'; name: string; order: number;
    matchCount: number; max: number; presets: number[];
    scores: Record<string, MatchScore>; // キーは "1".."10"
  };
  export type Settings = { capMode: CapMode; hideFromOrder: number; hidden: boolean };
  export type Totals = { blue: number; white: number };
  ```
- Produces（`src/shared/seed.ts`）: `SEED_COMPETITIONS: Competition[]`、`SEED_SETTINGS: Settings`
- Produces（`src/shared/scoring.ts`）:
  - `competitionTotals(c: Competition): Totals` — `1..matchCount` の試合だけを合計する
  - `boardTotals(cs: Competition[]): Totals`
  - `parseScoreInput(raw: string): { ok: true; value: number } | { ok: false; reason: string }`
  - `validateScore(c: Competition, match: number, team: Team, value: number, capMode: CapMode): { ok: true } | { ok: false; reason: string }`
  - `canSetMatchCount(c: Competition, next: number): { ok: true } | { ok: false; reason: string }`
  - `isHidden(c: Competition, s: Settings): boolean` — `s.hidden && c.order >= s.hideFromOrder`
  - `sortByOrder(cs: Competition[]): Competition[]`

- [ ] **Step 1: 土台を作る**
  `npm create vite@latest . -- --template react-ts` のあと、`vite.config.ts` で `build.rollupOptions.input` に `index.html` と `admin/index.html` を指定する。`npm i firebase motion`、`npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom firebase-tools @firebase/rules-unit-testing`。`tsconfig` は `strict: true`。`git init` をして初回コミットする。
- [ ] **Step 2: 失敗するテストを書く**（`tests/scoring.test.ts`）
  ```ts
  test('seed は実施順 A,B,D,C,E', () =>
    expect(sortByOrder(SEED_COMPETITIONS).map(c => c.id)).toEqual(['A','B','D','C','E']));
  test('試合数より後ろの点数は合計に入れない', () => {
    const c = { ...seedC, matchCount: 1, scores: { '1': {blue:40,white:10}, '2': {blue:40,white:10} } };
    expect(competitionTotals(c)).toEqual({ blue: 40, white: 10 });
  });
  test('全角数字を半角に直す', () => expect(parseScoreInput('４０')).toEqual({ ok: true, value: 40 }));
  test.each(['', '-5', '12.5', 'abc'])('不正な入力 %s は拒否する', raw =>
    expect(parseScoreInput(raw).ok).toBe(false));
  test('shared では青と白の合計が max を超える値を拒否する', () => {
    const c = { ...seedC, scores: { '1': { blue: 40, white: 10 } } };
    expect(validateScore(c, 2, 'blue', 51, 'shared').ok).toBe(false);
    expect(validateScore(c, 2, 'blue', 50, 'shared').ok).toBe(true);
  });
  test('perTeam ではチームごとに max まで', () => {
    const c = { ...seedC, scores: { '1': { blue: 60, white: 60 } } };
    expect(validateScore(c, 2, 'blue', 40, 'perTeam').ok).toBe(true);
    expect(validateScore(c, 2, 'blue', 41, 'perTeam').ok).toBe(false);
  });
  test('同じ試合の値の置き換えは、古い値を除いて判定する', () => {
    const c = { ...seedC, scores: { '1': { blue: 90, white: 10 } } };
    expect(validateScore(c, 1, 'blue', 90, 'shared').ok).toBe(true);
  });
  test('点数が入った試合を消す減らし方は止める', () => {
    const c = { ...seedC, matchCount: 2, scores: { '2': { blue: 40, white: 10 } } };
    expect(canSetMatchCount(c, 1).ok).toBe(false);
    expect(canSetMatchCount(c, 3).ok).toBe(true);
  });
  test('1〜10 以外の試合数は拒否する', () => {
    expect(canSetMatchCount(seedC, 0).ok).toBe(false);
    expect(canSetMatchCount(seedC, 11).ok).toBe(false);
  });
  test('hidden のときだけ hideFromOrder 以降を隠す', () => {
    expect(isHidden(seedE, { ...SEED_SETTINGS, hidden: true })).toBe(true);
    expect(isHidden(seedC, { ...SEED_SETTINGS, hidden: true })).toBe(false);
    expect(isHidden(seedE, SEED_SETTINGS)).toBe(false);
  });
  ```
  理由の文言（`reason`）は日本語で、何を直せばよいか分かる内容にする。例：「この競技は合計 100 点までです（あと 50 点）」
- [ ] **Step 3: テストを実行して失敗を確認する** — `npx vitest run tests/scoring.test.ts` → FAIL
- [ ] **Step 4: `types.ts` / `seed.ts` / `scoring.ts` を実装する**
- [ ] **Step 5: テストを実行して成功を確認する** — `npx vitest run` → PASS、`npx tsc --noEmit` → エラー 0
- [ ] **Step 6: コミット** — `git commit -m "feat: scoring domain logic and seed data"`

### Task 2: Firestore セキュリティルール

**Files:**
- Create: `firebase.json`（hosting `dist`、firestore rules、emulators: firestore 8080 / auth 9099）、`.firebaserc`（プロジェクト ID は仮の `demo-sportsday`）、`firestore.rules`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 の型（ドキュメントの形）
- Produces: コレクション `competitions/{A..E}`、`settings/app`、`log/{autoId}`。ルール内の `isAdmin()` は `request.auth.uid == 'SCORER_UID'`。`SCORER_UID` は Task 6 で実際の UID に置き換えるための目印

- [ ] **Step 1: Java を用意する** — `brew install openjdk@21`（ユーザーの許可を得てから実行する）。`java -version` が 21 になること
- [ ] **Step 2: 失敗するテストを書く**（`initializeTestEnvironment` に `projectId: 'demo-sportsday'` を渡し、rules ファイルを読み込む。認証済みのコンテキストは uid `SCORER_UID`）
  - `未ログインで competitions/A と settings/app を読める`
  - `未ログインでは competitions/A に書けない`
  - `得点係以外のログインユーザーも書けない`
  - `得点係は scores.1.blue を 40 に更新できる`
  - `得点係でも scores.1.blue = -1、12.5、max+1、文字列は拒否される`
  - `scores のキーが "11" や "x" なら拒否される`
  - `hidden=true かつ order>=hideFromOrder の競技は、未ログインでは読めないが、得点係は読める`
  - `hidden=false なら E も未ログインで読める`
  - `log は得点係だけが作成・閲覧でき、更新・削除は得点係でも拒否される`
- [ ] **Step 3: エミュレーターでテストを実行して失敗を確認する** — `npx firebase emulators:exec --only firestore "npx vitest run tests/rules.test.ts"` → FAIL
- [ ] **Step 4: `firestore.rules` を実装する**
  `competitions` の読み取り条件は `!get(/databases/$(database)/documents/settings/app).data.hidden || resource.data.order < get(...).data.hideFromOrder || isAdmin()`。書き込み時には、`name`（1〜30 文字）、`order`（整数 1〜10）、`matchCount`（整数 1〜10）、`max`（整数 1〜1000）、`presets`（list、6 件以下）、`scores`（map、キーは `'1'`〜`'10'` のみ）を確認する。存在する各キーについて、`blue`/`white` が整数で 0〜`max` であることを、`validMatch(m, max)` 関数を 10 個のキーそれぞれに当てて確かめる（ルールにはループがないため）。それ以外のパスは `allow read, write: if false`
- [ ] **Step 5: テストを実行して成功を確認する**（Step 3 と同じコマンド）→ PASS
- [ ] **Step 6: コミット** — `git commit -m "feat: firestore security rules with emulator tests"`

### Task 3: Firebase の接続・購読・書き込み

**Files:**
- Create: `src/shared/firebase.ts`, `src/shared/subscribe.ts`, `src/admin/adminApi.ts`
- Test: `tests/data.emulator.test.ts`

**Interfaces:**
- Consumes: Task 1 の型と `SEED_*`、`isHidden`、Task 2 のコレクション構成
- Produces:
  - `src/shared/firebase.ts`: `db`, `auth`。`import.meta.env.VITE_USE_EMULATOR === 'true'` のときはエミュレーターに接続する
  - `src/shared/subscribe.ts`: `subscribeBoard(onChange: (b: BoardState) => void): () => void`
    `type BoardState = { settings: Settings | null; competitions: Competition[]; hiddenIds: Competition['id'][]; connected: boolean }`
    `settings/app` を購読し、`isHidden` で隠れていない競技だけを個別に購読する。settings が変わったら購読し直す。隠れた競技のリスナーで出た permission-denied は無視する。`connected` は、どのスナップショットも `metadata.fromCache === false` を受け取ったら true、`offline` イベントが来たら false にする
  - `src/admin/adminApi.ts`:
    - `signInWithPasscode(passcode: string): Promise<void>` — `VITE_SCORER_EMAIL` と組み合わせて `signInWithEmailAndPassword` を呼ぶ
    - `signOutScorer(): Promise<void>`
    - `setScore(id, match: number, team: Team, value: number): Promise<number>` — 変更前の値を返す。`writeBatch` で `updateDoc(competitions/id, { ['scores.'+match+'.'+team]: value })` と `log` の作成を同時に行う
    - `updateCompetition(id, patch: Partial<Pick<Competition,'name'|'matchCount'|'max'|'presets'>>): Promise<void>`
    - `updateSettings(patch: Partial<Settings>): Promise<void>`
    - `seedIfEmpty(): Promise<boolean>` — `competitions` が空のときだけ `SEED_*` を書き込み、書いたら true を返す

- [ ] **Step 1: 失敗するテストを書く**（エミュレーター。auth エミュレーターに得点係ユーザーを作り、その UID でルールの `SCORER_UID` を置き換えたテスト用ルールを読み込む）
  - `seedIfEmpty は 1 回目 true、2 回目 false`
  - `setScore は変更前の値を返し、log が 1 件増える`
  - `試合 1 の blue と試合 2 の white を同時に setScore しても、両方残る`（`Promise.all`）
  - `subscribeBoard は hidden=true にすると E を competitions から外し、hiddenIds に 'E' を入れる。hidden=false に戻すと E を再び含める`
- [ ] **Step 2: 実行して失敗を確認する** — `npx firebase emulators:exec --only firestore,auth "npx vitest run tests/data.emulator.test.ts"` → FAIL
- [ ] **Step 3: 3 ファイルを実装する**
- [ ] **Step 4: 実行して成功を確認する**（Step 2 と同じコマンド）→ PASS
- [ ] **Step 5: コミット** — `git commit -m "feat: firestore subscription and admin write API"`

### Task 4: 表示画面（`/`）

**Files:**
- Create: `src/display/main.tsx`, `src/display/Display.tsx`, `src/display/TeamPanel.tsx`, `src/display/Breakdown.tsx`, `src/display/useSpringNumber.ts`, `src/display/display.css`
- Test: `tests/display.test.tsx`

**Interfaces:**
- Consumes: `subscribeBoard`, `BoardState`, `boardTotals`, `competitionTotals`, `sortByOrder`
- Produces: `Display({ board }: { board: BoardState })`（表示だけを担当する純粋なコンポーネント。購読は `main.tsx` で行う）

- [ ] **Step 1: 失敗するテストを書く**（`BoardState` を直接渡す）
  - `合計点を青と白それぞれに表示する`
  - `内訳を A,B,D,C,E の順に、競技名と青・白の小計つきで並べる`
  - `hiddenIds に E があるとき、青・白の合計と E の小計が「?」で、「結果は閉会式で発表」が表示される`
  - `hiddenIds が空に戻ると、合計が数字で表示される`
  - `connected=false のとき「再接続中」を表示する`
  - `settings が null（読み込み中）の間は「読み込み中」を表示し、0 点を表示しない`
- [ ] **Step 2: 実行して失敗を確認する** — `npx vitest run tests/display.test.tsx` → FAIL
- [ ] **Step 3: 実装する**
  `useSpringNumber(target: number): MotionValue<number>` は `useSpring(target, { bounce: 0, visualDuration: 0.4 })` を使い、`useReducedMotion()` が true のときは `jump()` で即座に切り替える。隠している間は、合計点の spring の target を「隠す前の合計」のままにして、画面には「?」を出す。こうすると、発表したときに、隠す前の点数から最終点まで数字が増えていく。点数が増えた側のパネルは、opacity のハイライトを 1 回だけ出す。レイアウトは `@media (orientation: landscape)` で左右に分け、それ以外は上下に分ける。数字は `font-variant-numeric: tabular-nums`、`letter-spacing: -0.02em`。白組パネルは白い背景に濃い文字
- [ ] **Step 4: 実行して成功を確認する** — `npx vitest run` → PASS
- [ ] **Step 5: 見た目を確認する** — エミュレーターと `npm run dev` を起動し、ブラウザペインで 375×812 と横向き 812×375 を確認する。管理 API で点数を変えたとき、1〜2 秒以内に数字が増えていくこと
- [ ] **Step 6: コミット** — `git commit -m "feat: live display screen"`

### Task 5: 管理画面（`/admin/`）

**Files:**
- Create: `src/admin/main.tsx`, `src/admin/Login.tsx`, `src/admin/Scorer.tsx`, `src/admin/TeamInput.tsx`, `src/admin/SettingsPanel.tsx`, `src/admin/UndoToast.tsx`, `src/admin/useSave.ts`, `src/admin/admin.css`
- Test: `tests/admin.test.tsx`

**Interfaces:**
- Consumes: `adminApi.ts` の全関数、`subscribeBoard`、`parseScoreInput`、`validateScore`、`canSetMatchCount`
- Produces: `useSave()` が返す `{ status: 'idle' | 'saving' | 'saved' | 'unsent' | 'error'; save: (fn: () => Promise<number>) => void }`。8 秒以内に完了しなければ `'unsent'` にする

- [ ] **Step 1: 失敗するテストを書く**（`adminApi` はモックする）
  - `合言葉が違うと「合言葉が違います」を表示し、入力欄を空にしない`
  - `ログイン後、競技タブが A,B,D,C,E の順で、選んだ競技の試合数だけ試合タブが出る`
  - `＋を押すと setScore(id, match, team, 現在値+1) が呼ばれる`
  - `プリセット「40」を押すと setScore(..., 40) が呼ばれる`
  - `数字をタップして「４０」と入力すると 40 で保存される`
  - `max を超える値は保存せず、validateScore の理由を表示する`
  - `保存後「保存しました」と「取り消す」が出て、取り消すと変更前の値で setScore が呼ばれる`
  - `setScore が 8 秒間返らないと「未送信：通信を確認してください」を表示し、入力した値は残る`（fake timers）
  - `setScore が reject すると「保存できませんでした。通信を確認してもう一度押してください」を表示する`
  - `設定で試合数を減らすと、点数がある試合が消える場合は理由を表示し、updateCompetition を呼ばない`
  - `「この競技から隠す」をオンにすると updateSettings({ hidden: true }) が呼ばれ、「発表する」で updateSettings({ hidden: false })`
  - `ログアウトボタンで signOutScorer が呼ばれ、ログイン画面に戻る`
  - `competitions が空のとき「初期データを作成」ボタンが出て、押すと seedIfEmpty が呼ばれる`
- [ ] **Step 2: 実行して失敗を確認する** — `npx vitest run tests/admin.test.tsx` → FAIL
- [ ] **Step 3: 実装する**
  ボタンは `:active` で `transform: scale(0.96)`、`transition: 100ms ease-out`（押した瞬間に反応させる）。タップ領域は 44px 以上。＋/− を押すたびにすぐ保存する。数字は `inputmode="numeric"` の入力欄に切り替えて直接入力できるようにする。左（縦向きでは上）が青、右（下）が白。取り消すトーストは 5 秒間表示する
- [ ] **Step 4: 実行して成功を確認する** — `npx vitest run` → PASS、`npx tsc --noEmit` → 0、`npm run build` → 成功
- [ ] **Step 5: 動作を確認する** — エミュレーター上で、管理画面と表示画面を並べて開く。入力・取り消し・隠す・発表するが、表示画面にすぐ反映されること
- [ ] **Step 6: コミット** — `git commit -m "feat: admin scoring screen"`

### Task 6: 本番の Firebase に公開する

**Files:**
- Modify: `firestore.rules`（`SCORER_UID` → 実際の UID）、`.firebaserc`（実際のプロジェクト ID）
- Create: `README.md`（運用メモ）

- [ ] **Step 1: ユーザーに作業してもらう** — Firebase コンソールでプロジェクトを作成し、Authentication のメール/パスワードを有効にする。得点係ユーザー（12 文字以上の合言葉）を作り、Firestore を `asia-northeast1` で作成する。Web アプリを登録して設定値を `.env.local` に入れる。`npx firebase login` も行ってもらう
- [ ] **Step 2: UID とプロジェクト ID を反映する** — `npx firebase emulators:exec ...` で Task 2 と Task 3 のテストを再実行し、PASS することを確かめる
- [ ] **Step 3: 公開する** — `npm run build && npx firebase deploy --only hosting,firestore:rules`（ユーザーの許可を得てから）
- [ ] **Step 4: 本番で確認する** — 管理画面で「初期データを作成」を押す → 点数を入れる → 別の端末の表示画面に反映されることを確かめる → 0 に戻す。未ログインのブラウザのコンソールから `competitions/A` に書き込もうとして拒否されることも確かめる
- [ ] **Step 5: 運用メモを書く**（`README.md`）— 表示用 URL と管理用 URL、合言葉の変え方（Firebase コンソール → Authentication → パスワード再設定）、試しに入れた点数を 0 に戻す方法、E を始めるときに「隠す」を押し閉会式で「発表する」を押す手順、D・E の競技名と試合数の変え方
- [ ] **Step 6: コミット** — `git commit -m "chore: production config and operations memo"`
