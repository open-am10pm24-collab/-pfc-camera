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
            text: `日本語のレシピ画像から「料理名」と「材料欄」を読み取り、JSONだけ返してください。
料理名が画像内で確認できなければ recipe_name は null。
材料は画像に実際に書かれている内容だけを抽出し、推測で追加しないでください。
quantity は数値だけ。分量が「適量」「少々」「お好み」など数値化できない場合は null。
unit は原文に近い単位を次のいずれかへ正規化してください:
g, ml, 大さじ, 小さじ, 個, 枚, 本, 片。
「1/2個」は quantity=0.5, unit="個" のようにしてください。
栄養成分は推測・計算しないでください。
{"recipe_name":string|null,"ingredients":[{"name":string,"quantity":number|null,"unit":string|null}]}`
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
      "鶏がらスープの素","コンソメ顆粒","豆板醤","甜麺醤","白だし","焼肉のたれ","めんつゆ（2倍濃縮）","粒マスタード","はちみつ","バター","マーガリン","粉チーズ","スライスチーズ","牛乳","無調整豆乳","ヨーグルト無糖","納豆","鮭","さば","たら","まぐろ赤身","えび","いか","大根","きゅうり","トマト","ブロッコリー","ほうれん草","小松菜","なす","かぼちゃ","さつまいも","れんこん","ごぼう","しらたき","鶏ささみ","鶏手羽元","鶏手羽先","豚もも肉","牛もも肉"
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
- confidence は "高" / "中" / "低"。
- match_reason は短い日本語。
- source は候補一致なら "candidate_match"、候補がなければ "ai_estimate"。
- nutrition は100gあたりの kcal,p,f,c,salt を返す。
- 大さじ/小さじ/個/枚/本/片/ml の重量換算も分かるものだけ返す。

候補リスト:
${JSON.stringify(candidateNames)}

入力:
${JSON.stringify(ingredients)}

JSONだけ返してください:
{"ingredients":[{"i":number,"resolved_name":string,"source":"candidate_match"|"ai_estimate","confidence":"高"|"中"|"低","match_reason":string,"nutrition":{"kcal":number,"p":number,"f":number,"c":number,"salt":number,"tbsp_g":number|null,"tsp_g":number|null,"piece_g":number|null,"sheet_g":number|null,"stick_g":number|null,"clove_g":number|null,"ml_g":number|null}}]}`
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PFC Camera running on port ${port}`));
