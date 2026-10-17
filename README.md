# CityGenesis

TypeScript、Three.js、Viteによる都市経営シミュレーションです。

## 開発

Node.jsはVite 7が対応するバージョン（20.19以上または22.12以上）を使用してください。
依存関係の導入後、`npm run dev`で開発サーバー、`npm test`でテスト、
`npm run build`で型検査とビルドを実行できます。

この初回登録時点の作業コピーにはlockファイルとnode_modulesがありません。
依存関係の導入、テスト実行、ビルドは初回アップロード作業では実施していません。

## 含まれるファイル

- `src/`: アプリケーションと保存・読み込み処理のソース
- `tests/`: バス運行・復旧、保存データ転送、ブラウザー起動設定のテスト
- `public/THIRD-PARTY-LICENSES.txt`: サードパーティーのライセンス
- `index.html`、`package.json`、`tsconfig.json`: エントリーと設定

`package.json`に残る`bench:*`、`test:p2:browser`、`qa`の参照先スクリプトは
この作業コピーには含まれていないため、実行できません。

都市の保存データ、認証情報、ブラウザープロファイル、作業記録、ビルド成果物は
登録対象外です。既存Sitesへの公開・更新はこのリポジトリの初回登録では行いません。
