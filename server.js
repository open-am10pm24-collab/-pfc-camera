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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PFC Camera running on port ${port}`));
