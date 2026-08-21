import express from "express";
import multer from "multer";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/analyze", upload.single("image"), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).send("image is required");
    const base64=req.file.buffer.toString("base64");
    const mime=req.file.mimetype || "image/jpeg";

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {type:"input_text", text:
`この食品パッケージの栄養成分表示を読み取り、JSONだけ返してください。
数値が読めない場合は null。炭水化物は carbohydrate / carbs に相当。
serving_size は「100g当たり」「1袋80g当たり」等の基準量。
serving_unit は g, ml, 個, 袋, 食 のいずれかを優先。
{
 "food_name": string|null,
 "serving_size": number|null,
 "serving_unit": string|null,
 "calories": number|null,
 "protein": number|null,
 "fat": number|null,
 "carbohydrates": number|null,
 "salt": number|null
}`},
          {type:"input_image", image_url:`data:${mime};base64,${base64}`}
        ]
      }]
    });

    const text=response.output_text.trim().replace(/^```json\s*/,'').replace(/```$/,'');
    res.json(JSON.parse(text));
  }catch(e){
    console.error(e);
    res.status(500).send(e.message || "analysis failed");
  }
});

const port=process.env.PORT || 3000;
app.listen(port,()=>console.log(`PFC Camera running on http://localhost:${port}`));
