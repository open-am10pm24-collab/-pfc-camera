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

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `日本の家庭料理で使う食材名を、栄養計算用の一般的な食品名へ標準化してください。
以下の食材はアプリ内データベースで見つからなかったものです。

各項目について:
1. resolved_name: 一般的で短い標準食品名。
2. source: 必ず "ai_estimate"。
3. nutrition: 100gあたりのおおよその kcal, P, F, C, 食塩相当量(g)。
4. 元の単位が大さじ・小さじ・個・枚・本・片・mlの場合に使える重量換算の目安も、分かるものだけ返す。
   tbsp_g=大さじ1のg、tsp_g=小さじ1のg、piece_g=1個のg、
   sheet_g=1枚のg、stick_g=1本のg、clove_g=1片のg、ml_g=1mlのg。
5. 不確かな値でも家庭用の概算として妥当な値を返す。ただし極端に断定しない。
6. 調味料は食塩相当量も可能な範囲で推定する。
7. 配列の i は入力の i をそのまま返す。

入力:
${JSON.stringify(ingredients)}

JSONだけ返してください:
{"ingredients":[{"i":number,"resolved_name":string,"source":"ai_estimate","nutrition":{"kcal":number,"p":number,"f":number,"c":number,"salt":number,"tbsp_g":number|null,"tsp_g":number|null,"piece_g":number|null,"sheet_g":number|null,"stick_g":number|null,"clove_g":number|null,"ml_g":number|null}}]}`
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
