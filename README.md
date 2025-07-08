# Claude traQ Bot

Claude AIを活用したtraQ
Bot。GitHubリポジトリをクローンして、Claudeがコードを読み込み、修正やレビューを行えます。

## 機能

- **GitHubリポジトリ連携**:
  コマンドでGitHubリポジトリを指定すると、自動的にクローン/更新
- **Claude AI統合**: Claude CLIを使用してコードの読み込み、修正、レビューを実行
- **チャンネル管理**:
  1つのチャンネルにつき1つのWorkerが割り当てられ、独立した作業環境を提供
- **永続化機能**:
  スレッド情報、セッションログ、監査ログを保存し、再起動後も継続可能
- **Dev Container対応**:
  リポジトリにdevcontainer.jsonがある場合、その環境内でClaudeを実行
- **レート制限対応**: Claude APIのレート制限に対応し、自動再開機能を提供
- **日本語→英語翻訳機能**:
  PLaMo-2-translateを使用して日本語の指示を英語に翻訳してからClaude
  Codeに渡す（オプション）
- **実行中断機能**: `/stop`コマンドで実行中のClaude Codeを安全に中断

## セットアップ

### 前提条件

#### 必須コマンド

- [Deno](https://deno.land/) (v1.40以上)
- [Git](https://git-scm.com/downloads)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code)

#### 推奨コマンド

- [GitHub CLI (gh)](https://cli.github.com/) - プライベートリポジトリ対応
- [Dev Container CLI](https://github.com/devcontainers/cli) -
  `npm install -g @devcontainers/cli`

### インストール手順

1. リポジトリをクローン

```bash
git clone https://github.com/[your-org]/claude-traq-bot.git
cd claude-traq-bot
```

2. traQ Botを作成
   - traQ管理者に依頼してBotを作成
   - Bot URLとBot ID、Bot秘密鍵を取得
   - アクセストークンを取得

3. 環境変数を設定

```bash
# .env.exampleをコピーして.envファイルを作成
cp .env.example .env

# .envファイルを編集して、実際の値を設定
# TRAQ_TOKEN: traQで取得したBotのアクセストークン
# WORK_BASE_DIR: 作業ディレクトリのパス（例: ~/claude-bot-work）
```

4. Git hooksをセットアップ（推奨）

```bash
deno task setup-hooks
```

5. Botを起動

```bash
# 開発モード（ウォッチモード）
deno task dev

# 本番モード
deno task start
```

## 使い方

### traQでの使用方法

1. Botを追加したチャンネルで以下のコマンドを実行:

```text
/start <GitHubリポジトリ名>
```

例: `/start octocat/Hello-World`

2. Botが自動的にチャンネルでリポジトリをクローン
3. チャンネル内でClaudeに指示を送信
4. Claudeがコードを読み込み、修正やレビューを実行

### 利用可能なコマンド

- `/start <repository>` - 新しいチャットセッションを開始
- `/set-pat <repository> <token> [description]` - GitHub Fine-Grained PATを設定
- `/list-pats` - 登録済みのGitHub PATの一覧を表示
- `/delete-pat <repository>` - 登録済みのGitHub PATを削除
- `/stop` - 実行中のClaude Codeを中断
- `/config <setting> <value>` - 設定を変更（例: `/config devcontainer on`）
- `/help` - コマンド一覧を表示

### コマンド例

- 「このリポジトリの構造を説明して」
- 「READMEを改善して」
- 「テストを追加して」
- 「バグを修正して」

### 実行の中断

実行中のClaude Codeを中断したい場合は、チャンネル内で以下のコマンドを送信:

```text
/stop
```

中断後も新しい指示を送信することで作業を継続できます。

## 設定項目

### 環境変数

| 変数名                        | 説明                                                   | 必須 | デフォルト |
| ----------------------------- | ------------------------------------------------------ | ---- | ---------- |
| `TRAQ_TOKEN`                  | traQ Botのアクセストークン                             | ✅   | -          |
| `WORK_BASE_DIR`               | 作業ディレクトリのベースパス                           | ✅   | -          |
| `CLAUDE_APPEND_SYSTEM_PROMPT` | Claude実行時に追加するシステムプロンプト               | ❌   | -          |
| `GEMINI_API_KEY`              | Google Gemini APIキー（スレッド名生成用）              | ❌   | -          |
| `PLAMO_TRANSLATOR_URL`        | PLaMo-2-translate APIのURL                             | ❌   | -          |
| `VERBOSE`                     | 詳細なデバッグログを出力（Claude実行時のコマンドなど） | ❌   | `false`    |

### 作業ディレクトリ構造

```text
WORK_BASE_DIR/
├── repositories/          # クローンされたGitHubリポジトリ
│   └── {org}/
│       └── {repo}/
├── threads/              # スレッド情報の永続化
│   └── {thread_id}.json
├── sessions/             # Claudeセッションログ
│   └── {thread_id}/
│       └── {session_id}.json
└── audit/               # 監査ログ（JSONL形式）
    └── {date}/
        └── activity.jsonl
```

## 開発方法

### 開発環境のセットアップ

```bash
# 依存関係のインストール（Denoは自動的に管理）
deno cache src/main.ts

# Git hooksのセットアップ
deno task setup-hooks
```

### 開発コマンド

```bash
# コードフォーマット
deno task fmt

# リント
deno task lint

# 型チェック
deno task check

# テスト実行
deno task test

# 全チェック（フォーマット → リント → 型チェック → テスト）
deno task test:all:quiet
```

### トークン節約版コマンド（CI/CD向け）

エラー時のみ詳細を出力するquiet版:

```bash
deno task fmt:quiet
deno task lint:quiet
deno task check:quiet
deno task test:quiet
deno task test:all:quiet
```

### テスト

```bash
# 全テスト実行
deno test --allow-read --allow-write --allow-env --allow-run

# 特定のテストファイルを実行
deno test --allow-read --allow-write --allow-env --allow-run src/worker_test.ts
```

### デバッグ

1. 開発モードで起動

```bash
deno task dev
```

2. ログの確認

- 標準出力にログが表示されます
- 監査ログ: `WORK_BASE_DIR/audit/{date}/activity.jsonl`
- セッションログ: `WORK_BASE_DIR/sessions/{thread_id}/{session_id}.json`

## アーキテクチャ

### システム概要

traQ
BotはAdmin-Worker型のマルチプロセスアーキテクチャを採用しています。1つのAdminプロセスが複数のWorkerを管理し、各Workerが1つのtraQチャンネルを担当します。

### 主要コンポーネント

#### Admin (`src/admin.ts`) - 1748行

プロセス全体で1つだけ起動される管理モジュール。

- **Worker管理**: チャンネルごとにWorkerインスタンスを作成・管理
- **メッセージルーティング**:
  チャンネルIDに基づいてメッセージを適切なWorkerに転送
- **レート制限管理**: Claude APIのレート制限を検出し、自動再開タイマーを管理
- **Devcontainer対応**: リポジトリのdevcontainer.jsonを検出し、実行環境を選択
- **状態永続化**: アプリケーション再起動後のチャンネル復旧機能

#### Worker (`src/worker.ts`) - 1667行

各チャンネルに1対1で対応する実行モジュール。

- **Claude CLI実行**: ホスト環境またはDevcontainer環境でClaude CLIを実行
- **ストリーミング処理**: JSON Lines形式でClaudeの出力をリアルタイム処理
- **メッセージフォーマット**: ツール使用の可視化、長文要約、TODOリストの特別処理
- **翻訳機能統合**: PLaMo-2-translateによる日本語→英語翻訳（オプション）
- **セッションログ記録**: 全てのやり取りを永続化

#### WorkspaceManager (`src/workspace.ts`) - 636行

作業ディレクトリとデータ永続化を一元管理。

- **11種類のディレクトリ管理**:
  repositories、threads、sessions、audit、worktrees等
- **データ永続化**:
  スレッド情報、セッションログ、監査ログ、PAT情報などをJSON形式で保存
- **Worktree管理**: Git worktreeのコピー作成・削除による独立した作業環境
- **メッセージキュー**: レート制限時のメッセージ保存と処理

#### ユーティリティモジュール

- **GitUtils** (`src/git-utils.ts`): GitとGitHub CLIを使用したリポジトリ操作
- **DevContainer** (`src/devcontainer.ts`): Dev Container
  CLIとの連携、ストリーミングログ処理
- **Gemini** (`src/gemini.ts`): Google Gemini APIによるスレッド名自動生成
- **PLaMoTranslator** (`src/plamo-translator.ts`):
  コーディング指示に特化した日本語→英語翻訳

### メッセージ処理フロー

```text
traQ User
    ↓
main.ts (MESSAGE_CREATED Event)
    ↓
admin.routeMessage()
    ├─ レート制限チェック → キューイング
    └─ Worker検索
          ↓
worker.processMessage()
    ├─ PLaMo翻訳（オプション）
    └─ Claude CLI実行（ストリーミング）
          ↓
メッセージタイプ別処理
    ├─ assistant: フォーマット処理
    ├─ tool_use: アイコン付き表示
    ├─ tool_result: スマート要約
    └─ error: エラーハンドリング
          ↓
traQ送信（メッセージ長制限対応）
```

### Dev Container統合

リポジトリにdevcontainer.jsonが存在する場合：

1. Dev Container CLIの可用性チェック
2. Anthropics features（Claude Code）の検出
3. ユーザー選択によるDevcontainer起動
4. コンテナ内でのClaude実行

### 状態管理と永続化

- **スレッド情報**: 作成時刻、最終アクティブ時刻、リポジトリ情報、ステータス
- **セッションログ**: Claudeとのやり取りを時系列でJSONL形式記録
- **監査ログ**: システムアクションの追跡（Worker作成、メッセージ受信等）
- **再起動対応**: AdminState/WorkerStateによる状態復旧

## トラブルシューティング

### Botが応答しない

- traQ Tokenが正しく設定されているか確認
- Botが適切なチャンネルに追加されているか確認
- ログでエラーメッセージを確認

### Claude CLIエラー

- Claude CLIがインストールされているか確認: `claude --version`
- Claude APIキーが設定されているか確認

### リポジトリクローンエラー

- プライベートリポジトリの場合、GitHub CLIがインストールされ認証済みか確認:
  `gh auth status`
- 作業ディレクトリの権限を確認

## 技術スタック

- **Runtime**: Deno v1.40+
- **Language**: TypeScript (厳格モード)
- **traQ Library**: traq-bot-ts v1.2.1+
- **AI Integration**: Claude CLI
- **Version Control**: Git

## 開発ツール

標準的なものに加えて、以下のツールが利用可能です：

- **ripgrep**: 高速なテキスト検索
- **ast-grep (sg)**: 構文木ベースのコード検索
- **semgrep**: セマンティックなコード分析

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを作成して変更内容について議論してください。

### 開発方針

- TypeScriptの厳格モードを使用（any型禁止）
- すべての機能にテストを追加
- コミット前に`deno task test:all:quiet`を実行
- テスト駆動開発（TDD）を推奨

### テストカバレッジ

プロジェクトは充実したテストスイートを持っています：

#### 単体テスト (`src/*_test.ts`)

- ✅ 主要モジュール: admin、worker、workspace（部分的）
- ✅ ユーティリティ:
  git-utils、devcontainer、gemini、plamo-translator、system-check
- ❌ 未テスト: main.ts、env.ts、worker-name-generator.ts

#### 統合テスト (`test/*.test.ts`)

- システム全体の統合テスト
- 永続化機能の統合テスト
- レート制限機能のテスト
- ストリーミング処理のテスト
- Devcontainer関連の複数テスト

#### テストの特徴

- 日本語テスト名による高い可読性
- `test-utils.ts`による共通モック機能
- ストリーミング対応の高度なモック
- 適切なクリーンアップ処理

## Discord版からの変更点

このBotは元々Discord向けに開発されましたが、traQ向けに以下の変更を行いました：

### 主な変更点

1. **プラットフォーム変更**
   - Discord.js → traq-bot-ts
   - Discord slash commands → traQテキストコマンド
   - Discord threads → traQチャンネル

2. **環境変数**
   - `DISCORD_TOKEN` → `TRAQ_TOKEN`

3. **コマンド形式**
   - スラッシュコマンド → テキストベースコマンド
   - 例: `/start repo` (Discord) → `/start repo` (traQ)

4. **メッセージ処理**
   - Discord components (buttons) → テキストベースの情報表示
   - Discord reactions → ログベースの状態通知
   - Discord thread archiving → チャンネル終了時の通知のみ

5. **機能の適応**
   - Discord固有の機能（リアクション、ボタン等）をtraQ向けに調整
   - メッセージフォーマットをtraQに最適化

### 互換性

- Adminクラス、Workerクラス、WorkspaceManagerクラスの主要機能は保持
- Claude CLI統合、Dev Container対応、永続化機能は変更なし
- テストスイートも引き続き動作
