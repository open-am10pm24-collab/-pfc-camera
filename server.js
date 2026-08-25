import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/analyze", async (req, res) => {
  try {
    const image = req.body?.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).send("画像データがありません");
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `食品パッケージ画像から栄養成分表示を読み取り、JSONだけ返してください。
商品名は画像内に実際に確認できる場合だけ food_name に入れてください。見えない・判別できない場合は推測せず null。
数値が読めない場合も null。
serving_size は「100g当たり」「1袋80g当たり」等の基準量。
serving_unit は g, ml, 個, 袋, 食 のいずれかを優先。
{"food_name":string|null,"serving_size":number|null,"serving_unit":string|null,"calories":number|null,"protein":number|null,"fat":number|null,"carbohydrates":number|null,"salt":number|null}`
          },
          { type: "input_image", image_url: image }
        ]
      }]
    });

    const text = response.output_text.trim()
      .replace(/^```json\s*/, "")
      .replace(/```$/, "");

    res.json(JSON.parse(text));
  } catch (e) {
    console.error("ANALYZE_ERROR", e);
    res.status(500).send(e?.message || "analysis failed");
  }
});


app.post("/api/analyze-recipe", async (req, res) => {
  try {
    const image = req.body?.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).send("画像データがありません");
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `日本語のレシピ画像から「料理名」「材料欄」に加えて、画像内で確認できる範囲の調理方法も読み取り、JSONだけ返してください。
料理名が画像内で確認できなければ recipe_name は null。
dish_type は「汁物・スープ」「煮物」「煮詰め」「炒め物」「焼き物」「蒸し物」「揚げ物」「鍋」「その他」などから最も近いもの。
method_summary は、画像内に調理手順が見える場合だけ、水分変化の判断に役立つ短い要約を返してください。手順が見えなければ空文字。
water_behavior は「水分をほぼ残す」「一部蒸発」「しっかり煮詰める」「食材水分が減る」「不明」のいずれか。画像から判断できない場合は「不明」。
材料は画像に実際に書かれている内容だけを抽出し、推測で追加しないでください。

重要:
- 「醤油・酒・砂糖・みりん 各大さじ4」
- 「しょうゆ、酒、みりん 各大さじ2」
- 「A/B/C 各小さじ1」
のように、複数材料を列挙したあとに「各○○」と書かれている場合は、
列挙された各材料を必ず別々の ingredients 要素へ展開し、
全てに同じ quantity と unit を設定してください。
例:
「醤油・酒・砂糖・みりん 各大さじ4」
→
醤油 quantity=4 unit="大さじ"
酒 quantity=4 unit="大さじ"
砂糖 quantity=4 unit="大さじ"
みりん quantity=4 unit="大さじ"

quantity は数値だけ。分量が「適量」「少々」「お好み」など数値化できない場合は null。
unit は原文に近い単位を次のいずれかへ正規化してください:
g, ml, 大さじ, 小さじ, 個, 枚, 本, 片, 袋, パック。
「1/2個」は quantity=0.5, unit="個" のようにしてください。\n「1袋」「1パック」は quantity=1, unit="袋" / "パック" のように保持し、勝手に1gへ変換しないでください。
栄養成分は推測・計算しないでください。
{"recipe_name":string|null,"dish_type":string,"method_summary":string,"water_behavior":string,"ingredients":[{"name":string,"quantity":number|null,"unit":string|null}]}`
          },
          { type: "input_image", image_url: image }
        ]
      }]
    });

    const text = response.output_text.trim()
      .replace(/^```json\s*/, "")
      .replace(/```$/, "");

    res.json(JSON.parse(text));
  } catch (e) {
    console.error("RECIPE_ANALYZE_ERROR", e);
    res.status(500).send(e?.message || "recipe analysis failed");
  }
});


app.post("/api/resolve-ingredients", async (req, res) => {
  try {
    const ingredients = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
    if (!ingredients.length) return res.json({ ingredients: [] });

    const candidateNames = [
      "玉ねぎ","キャベツ","にんじん","ピーマン","赤パプリカ","黄パプリカ","もやし",
      "じゃがいも","白菜","長ねぎ","しいたけ","しめじ","えのき",
      "鶏むね肉（皮なし）","鶏もも肉（皮なし）","豚こま切れ肉","豚ばら肉",
      "豚ロース肉","豚ひき肉","牛こま切れ肉","牛ひき肉","鶏ひき肉","卵",
      "木綿豆腐","ごはん（炊飯後）","食用油","オリーブオイル","ごま油",
      "しょうゆ","みりん","料理酒","砂糖","塩","味噌","マヨネーズ","ケチャップ",
      "オイスターソース","片栗粉","小麦粉","パン粉","にんにく","しょうが",
      "酢","ポン酢","ウスターソース","中濃ソース","めんつゆ（3倍濃縮）",
      "鶏がらスープの素","和風だし顆粒","コンソメ顆粒","豆板醤","甜麺醤","白だし","焼肉のたれ","めんつゆ（2倍濃縮）","粒マスタード","はちみつ","バター","マーガリン","粉チーズ","スライスチーズ","牛乳","無調整豆乳","ヨーグルト無糖","納豆","鮭","さば","たら","まぐろ赤身","えび","いか","大根","きゅうり","トマト","ブロッコリー","ほうれん草","小松菜","なす","かぼちゃ","さつまいも","れんこん","ごぼう","しらたき","鶏ささみ","鶏手羽元","鶏手羽先","豚もも肉","牛もも肉"
    ];

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `日本の家庭料理の材料名を栄養計算用に標準化してください。

最重要ルール:
- まず候補リストの中に、同一・同義・一般的に対応する食品がないか探す。
- 候補があれば resolved_name は必ず候補リスト内の名前にする。
- 候補があるのに新しい食品名を作らない。
- 候補がない場合だけ一般的な標準食品名を作り、100gあたりの栄養を概算する。
- 商品名、ブランド名、切り方などの修飾語は栄養計算に不要なら一般食品へ寄せる。
- 例: 豚バラ薄切り→豚ばら肉、おろししょうが→しょうが、サラダ油→食用油。
- 「ほんだし」「本だし」「かつおだし顆粒」は必ず「和風だし顆粒」へ寄せる。
- 「ほんだし」を「鶏がらスープの素」にしてはいけない。
- 「鶏がらスープの素」は中華系の鶏だし、「和風だし顆粒」は鰹系の和風だしとして別食品に扱う。
- 「白滝1袋」「しらたき1袋」は unit を「袋」のまま保持する。
- confidence は "高" / "中" / "低"。
- match_reason は短い日本語。
- source は候補一致なら "candidate_match"、候補がなければ "ai_estimate"。
- nutrition は100gあたりの kcal,p,f,c,salt を返す。
- 大さじ/小さじ/個/枚/本/片/袋/パック/ml の重量換算も分かるものだけ返す。

候補リスト:
${JSON.stringify(candidateNames)}

入力:
${JSON.stringify(ingredients)}

JSONだけ返してください:
{"ingredients":[{"i":number,"resolved_name":string,"source":"candidate_match"|"ai_estimate","confidence":"高"|"中"|"低","match_reason":string,"nutrition":{"kcal":number,"p":number,"f":number,"c":number,"salt":number,"tbsp_g":number|null,"tsp_g":number|null,"piece_g":number|null,"sheet_g":number|null,"stick_g":number|null,"clove_g":number|null,"bag_g":number|null,"pack_g":number|null,"ml_g":number|null}}]}`
        }]
      }]
    });

    const text = response.output_text.trim()
      .replace(/^```json\s*/, "")
      .replace(/```$/, "");

    res.json(JSON.parse(text));
  } catch (e) {
    console.error("RESOLVE_INGREDIENTS_ERROR", e);
    res.status(500).send(e?.message || "ingredient resolve failed");
  }
});


app.post("/api/predict-finished-weight", async (req, res) => {
  try {
    const recipeName = String(req.body?.recipe_name || "").trim();
    const ingredientWeight = Number(req.body?.ingredient_weight || 0);
    const ingredients = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
    const dishType = String(req.body?.dish_type || "");
    const methodSummary = String(req.body?.method_summary || "");
    const waterBehavior = String(req.body?.water_behavior || "");
    const history = Array.isArray(req.body?.measured_history) ? req.body.measured_history.slice(-8) : [];

    if (!recipeName || !ingredientWeight || !ingredients.length) {
      return res.status(400).send("予測に必要な料理名・材料重量がありません");
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `家庭料理の「調理後の完成重量」を概算してください。
これは栄養計算で100gあたりの値を出すための参考値です。断定せず、必ず幅を持たせてください。

重要ルール:
- 材料重量合計をそのまま完成重量と決めつけない。
- スープ・鍋・汁物は水分を比較的残す。
- 煮物は煮汁の残し方で幅を広くする。
- 「煮詰める」「汁気がなくなるまで」等があれば蒸発を多めに考える。
- 炒め物・焼き物は食材自身の水分減少を考える。
- 揚げ物は水分減少と油吸収の両方があり得る。
- 手順情報が不足している場合は信頼度を下げ、範囲を広くする。
- 過去の実測履歴がある場合は、それを最優先の参考情報の一つにする。
- 過去履歴は同じユーザーの実測値なので、同じ料理名に近いほど重視する。
- 推定値を実測値のように扱わない。
- estimated_weight は min_weight と max_weight の間にする。
- 完成重量は正の数値(g)。

料理名: ${recipeName}
材料重量合計: ${ingredientWeight}g
材料: ${JSON.stringify(ingredients)}
料理分類: ${dishType || "不明"}
画像から読めた調理方法: ${methodSummary || "情報なし"}
水分挙動: ${waterBehavior || "不明"}
過去の実測履歴: ${JSON.stringify(history)}

JSONだけ返してください:
{"estimated_weight":number,"min_weight":number,"max_weight":number,"retention_rate":number,"dish_type":string,"reason":string,"confidence":"高"|"中"|"低","history_count":number}`
        }]
      }]
    });

    const text = response.output_text.trim()
      .replace(/^```json\s*/, "")
      .replace(/```$/, "");

    const data = JSON.parse(text);

    // 最低限の安全補正
    let est = Number(data.estimated_weight);
    let min = Number(data.min_weight);
    let max = Number(data.max_weight);
    if (!Number.isFinite(est) || est <= 0) est = ingredientWeight;
    if (!Number.isFinite(min) || min <= 0) min = est * 0.9;
    if (!Number.isFinite(max) || max <= 0) max = est * 1.1;
    if (min > max) [min, max] = [max, min];
    est = Math.min(max, Math.max(min, est));

    res.json({
      ...data,
      estimated_weight: Math.round(est),
      min_weight: Math.round(min),
      max_weight: Math.round(max),
      retention_rate: Number(data.retention_rate) || est / ingredientWeight,
      history_count: history.length
    });
  } catch (e) {
    console.error("PREDICT_FINISHED_WEIGHT_ERROR", e);
    res.status(500).send(e?.message || "finished weight prediction failed");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PFC Camera running on port ${port}`));
