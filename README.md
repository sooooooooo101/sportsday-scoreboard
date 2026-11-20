# 体育祭 2026 得点ボード

青組と白組の得点を、誰でもスマホでリアルタイムに見られる表示画面（`/`）と、得点係が合言葉で入力する管理画面（秘密のパス `/<ADMIN_PATH>/`）。

- 設計：[docs/superpowers/specs/2026-11-19-sports-day-scoreboard-design.md](docs/superpowers/specs/2026-11-19-sports-day-scoreboard-design.md)
- 競技の元データ：[docs/reference/競技部門A-E_抽出.md](docs/reference/競技部門A-E_抽出.md)

使っているもの：Vite + React + TypeScript / Firebase（Firestore・Authentication・Hosting）/ motion

---

## 当日の使い方（得点係向け）

| やりたいこと | 手順 |
|---|---|
| 入力を始める | 得点係だけに共有した管理画面の URL（`https://<プロジェクトID>.web.app/<ADMIN_PATH>/`）を開き、合言葉を入れる |
| 点数を入れる | 上の A〜E で競技を選ぶ → 第◯試合を選ぶ → 青と白それぞれに ＋/− か、よく使う点数を押す。数字をタップすると直接入力できる |
| 間違えた | 下に出る「取り消す」を押す（5 秒間）。過ぎたら、正しい数字を入れ直す |
| 「未送信」と出た | 電波を確認する。入れた値は画面に残っているので、もう一度押す |
| 最後の競技を始める | 設定 → 「（競技名）から隠す」を押す。表示画面の合計点と、その競技の点数が「?」になる |
| 閉会式で発表 | 設定 → 「発表する」→「本当に発表する」。合計点が数字の増えていく演出で出る |
| 終わったら | 「ログアウト」を押す |
| 「保存できませんでした。満点を超えたか…」と出た | 別の端末の入力と重なったか、合計が満点を超えた。画面の数字（サーバーの最新値）を確認してから入れ直す |

**満点のルール**：1 競技で青と白の合計が 100 点まで（設定 → 満点の数え方 で「チームごとに 100 点まで」にも変えられる）。**玉入れ（B）だけは上限なし**で、玉の点数をそのまま入れる（1 試合 1000 点まで）。

## サーバー側で守っていること

画面のチェックに加えて、Firestore のルールが毎回確かめる（同時に入力しても抜け道がない）。

- 1 競技の合計が満点を超える書き込み（玉入れを除く）
- 点数が入っている試合が消えるような試合数の削減、試合数より後ろの試合への点数
- 今の合計より低い満点への変更
- 得点係以外の書き込み、隠している競技の閲覧

変更の記録（`log` コレクション）には、点数・設定・競技設定の変更がサーバー時刻つきで残る。Firebase コンソール → Firestore → `log` で見られる。

## 試しに入れた点数を 0 に戻す

管理画面で、各競技の各試合の数字をタップして `0` を入れる。

## 管理画面の URL を変える（漏れたとき）

管理画面は `/admin` ではなく、推測できない秘密のパスに置いている（`/admin` は 404）。

1. `.env.local` の `ADMIN_PATH` を新しい値にする（`openssl rand -hex 16`）
2. `npm run deploy`
3. 新しい URL を得点係にだけ伝える

URL を隠すのは見つかりにくくするための層で、点数を守る本体は合言葉と Firestore のルール。

## 合言葉を変える（漏れたとき）

1. [Firebase コンソール](https://console.firebase.google.com/) → プロジェクト → Authentication → ユーザー
2. 得点係のユーザーの「︙」→「パスワードをリセット」ではなく、**ユーザーを編集してパスワードを変更**する
3. 新しい合言葉を得点係にだけ伝える（12 文字以上）

すでにログインしている端末は、最長 1 時間ほどログインしたままになる場合がある。急ぐときは、ユーザーを「無効」にしてから新しいユーザーを作り直し、下の「本番に公開する」の手順 3 で UID を入れ替える。

## D・E の企画が変わったら

管理画面 → D（または E）を選ぶ → 設定 → 競技名・試合数・よく使う点数を変えて「競技の設定を保存」。
点数が入っている試合は、0 に戻すまで試合数を減らせない（点数が黙って消えないようにするため）。

---

## 開発

必要なもの：Node 22 以上、Java 21（Firestore エミュレーター用。`brew install openjdk@21`）

```bash
npm install
npm test               # 単体テスト（エミュレーター不要）
npm run test:emu       # セキュリティルールとデータ層のテスト（Java が必要）
npm run typecheck
npm run build
```

`npm run test:emu` は Java にパスが通っている必要がある：

```bash
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
```

### ローカルで動かす（エミュレーター）

```bash
npx firebase emulators:start --only firestore,auth --project demo-sportsday
```

別のターミナルで：

```bash
node scripts/dev-setup.mjs --seed   # 得点係ユーザー作成・ルール反映・サンプルデータ投入
npm run dev                         # http://localhost:5173/ と /admin/（/admin/ はローカル開発だけ。本番は秘密のパス）
```

`.env.development.local` にエミュレーター用の設定がある（合言葉は `scripts/dev-setup.mjs` の `DEV_PASSCODE`）。
`node scripts/dev-poke.mjs score C 1 blue 40` / `hide` / `reveal` で、エミュレーターのデータを直接変えて表示を確かめられる。

---

## 本番に公開する

1. **Firebase プロジェクトを作る**（Google アカウントで）
   - コンソールでプロジェクトを作成（Google アナリティクスは不要）
   - Authentication → ログイン方法 → 「メール / パスワード」を有効にする
   - Authentication → 設定 → ユーザーアクション → **「作成（登録）を許可」をオフ**にする（得点係以外がアカウントを作れないように）
   - Authentication → ユーザー → 得点係ユーザーを追加（メールは任意の文字列でよい。例 `scorer@<プロジェクトID>.local`、パスワード = 合言葉 12 文字以上）。**UID を控える**
   - Firestore Database → 作成（本番モード、ロケーション `asia-northeast1`）
   - プロジェクトの設定 → マイアプリ → ウェブアプリを追加 → 表示された設定値を控える
2. **設定ファイルを作る**：`.env.example` をコピーして `.env.local` を作り、手順 1 の値を入れる（`VITE_USE_EMULATOR=false`、`VITE_SCORER_EMAIL` = 得点係のメール、`SCORER_UID` = 得点係の UID、`ADMIN_PATH` = `openssl rand -hex 16` の出力）
3. **公開する**
   ```bash
   npx firebase login
   npx firebase use <プロジェクトID>
   npm run deploy
   ```
   `npm run deploy` は、`firestore.rules` の `SCORER_UID` の目印を `.env.local` の UID に置き換えた `.deploy/firestore.rules` を作り、管理画面を `ADMIN_PATH` の場所へ移してから公開する。リポジトリの `firestore.rules` は書き換えないので、`npm run test:emu` はそのまま動く。UID が空や不正なら公開を止める。
4. **本番で確かめる**：管理画面で「初期データを作成」→ 点数を入れる → 別の端末の表示画面に出る → 0 に戻す

### 無料プラン（Spark）の読み取り上限について

点数を 1 回入れるたびに、表示画面を開いている人数分の「読み取り」が発生する。無料プランは 1 日 5 万回まで。
目安：300 人が見ていて 100 回入力すると約 3 万回。超えると表示が更新されなくなる（画面に「再接続中」が出る）。
観客が多くなりそうなら、Blaze（従量課金）に切り替えて予算アラートを設定しておく（この規模なら数十円程度）。
