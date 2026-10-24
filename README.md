# Certivo（PWA 版）

claude.ai アーティファクト版の Certivo を、claude.ai の外で動く独立した Web アプリ（PWA）にしたもの。要件定義書の Phase 3 に相当。

## できること
- スマホ・PC のブラウザから「ホーム画面に追加 / インストール」してアプリとして起動
- オフラインでも学習できる（アプリ本体と資格パックを端末に保存）
- 学習記録は端末内（localStorage）に保存。設定の「バックアップを書き出す/読み込む」で端末間を移動
- 誤り報告は端末内に保存し、進捗画面から「まとめてコピー」してチャットで送る
- AI チューター：サーバー側に `ANTHROPIC_API_KEY` を設定したときだけ表示（キーは画面側に置かない）

## ファイル
- `index.html` アプリ本体（1ページ）
- `certs/` 資格パック（追加はファイルを足して `certs/index.json` に登録。`sw.js` の SHELL にも追記）
- `manifest.webmanifest`, `sw.js`, `icons/` PWA 用
- `api/tutor.js` AI チューター用の Vercel 関数（Claude API）

## ローカルで動かす
`npx serve .` または `python3 -m http.server` で配信して http://localhost を開く。

## 公開（Vercel）
このフォルダをそのまま Vercel にデプロイ（ビルド不要）。AI チューターを使う場合は環境変数 `ANTHROPIC_API_KEY`（任意で `CERTIVO_MODEL`）を設定。

## 次の拡張（Phase 3 の残り）
- 端末間の自動同期：`index.html` の `Store.connect()` に Supabase などを接続
- 通知（毎日のリマインダー）
