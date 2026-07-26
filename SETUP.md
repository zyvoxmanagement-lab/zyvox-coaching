# Zyvox Coaching App — セットアップ手順

## 技術スタック（無料）
- **Next.js 14** — フロントエンド＋APIルート
- **Supabase** — データベース（PostgreSQL）+ 無料ホスティング
- **Vercel** — デプロイ（無料）

---

## Step 1: Node.js インストール

https://nodejs.org から LTS版をダウンロードしてインストール。

---

## Step 2: Supabase プロジェクト作成

1. https://supabase.com でサインアップ（無料）
2. 「New Project」でプロジェクト作成
3. **SQL Editor** を開いて `supabase/schema.sql` の内容を貼り付けて実行
4. **Project Settings > API** から以下を控える：
   - `Project URL`
   - `anon public key`

---

## Step 3: 環境変数設定

```bash
cp .env.local.example .env.local
```

`.env.local` を以下の内容で編集：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co   # SupabaseのProject URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...              # Supabaseのanon key
ADMIN_PASSWORD=zyvox2024                              # 管理者ログインパスワード（変更推奨）
JWT_SECRET=ランダムな32文字以上の文字列              # 例: openssl rand -base64 32
```

---

## Step 4: 依存関係インストール＆起動

```bash
cd zyvox-coaching
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く

---

## Step 5: Vercel デプロイ（無料）

```bash
npm install -g vercel
vercel
```

または https://vercel.com で GitHub連携してデプロイ。

環境変数は Vercel ダッシュボード > Settings > Environment Variables に設定。

---

## 使い方

### 管理者
- `https://あなたのドメイン/admin/login` でログイン
- パスワードは `.env.local` の `ADMIN_PASSWORD`
- 顧客追加後、「🔗 URL」ボタンで顧客専用URLをコピー

### 顧客
- 管理者から受け取った専用URL（`/client/xxxxxx-xxxx-...`）にアクセス
- ログイン不要でアクセス可能
- 日報入力、ゴール閲覧、理想実現マップ閲覧、履歴確認が可能

---

## スコア・レベルシステム

Excelから移植済み：

| レベル帯 | 必要P増分 |
|---------|---------|
| Lv1〜10 | +10P/Lv |
| Lv11〜30 | +50P/Lv |
| Lv31〜40 | +70P/Lv |
| Lv41〜50 | +100P/Lv |
| Lv51〜60 | +140P/Lv |
| Lv61〜70 | +190P/Lv |
| Lv71〜80 | +250P/Lv |
| Lv81〜90 | +320P/Lv |
| Lv91〜100 | +400P/Lv |
| Lv101〜120 | +490P/Lv |
| Lv121〜150 | +600P/Lv |

- 週次ゴール全達成：+100P
- 月次ゴール全達成：+500P
- 年次ゴール達成：+3000P

管理者が日報にスコアを付与 → 自動でLv計算・更新
