# PFC Camera 試作版

iPhone / iPad のSafariで使うことを想定したPFC管理PWAです。

## できること
- カメラから栄養成分表示を撮影
- OpenAI APIで栄養成分を抽出
- 読み取り結果の修正
- 食べた量に応じてP/F/C/kcalを自動換算
- 朝食 / 昼食 / 夕食 / 間食で登録
- 1日の合計と残り目標を表示
- SafariのlocalStorageに保存
- ホーム画面追加用PWA

## 起動方法
1. Node.js 18以上を用意
2. このフォルダで `npm install`
3. OpenAI APIキーを環境変数に設定
   - macOS/Linux: `export OPENAI_API_KEY="..."` 
4. `npm start`
5. `http://localhost:3000` を開く

## iPhoneで使うには
ローカルPC上で起動しただけではiPhoneから安全にカメラ/APIを使いにくいため、
Vercel / Render / RailwayなどHTTPS対応のホスティングに置くのがおすすめです。

Safariでサイトを開き、
共有 → ホーム画面に追加
でアプリ風に使えます。

## 注意
- APIキーをHTML/JavaScriptへ直接書かないでください。
- AI読み取りは必ず確認画面を通してから登録する設計です。
- 医療用途ではなく、日常の食事記録用の試作です。
