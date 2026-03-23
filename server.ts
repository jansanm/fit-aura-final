import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Keys are loaded from .env file — never hardcode secrets in source code
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Meshy API (active) ---
const MESHY_KEY = process.env.MESHY_API_KEY || "msy_dummy_api_key_for_test_mode_12345678";

// --- Tripo3D API (active) ---
const TRIPO_API_KEY = process.env.TRIPO_API_KEY;
const BASE_URL = "https://api.tripo3d.ai/v2/openapi";

// Meshy helpers
async function createMeshyTask(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const base64 = imageBuffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  const res = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MESHY_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: dataUri,
      should_remesh: true,
      should_texture: true,
      enable_pbr: true,
      pose_mode: "t-pose",
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.message || "Meshy task creation failed");
  return data.result;
}

async function pollMeshyTask(taskId: string) {
  const res = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
    headers: { "Authorization": `Bearer ${MESHY_KEY}` },
  });
  return res.json() as Promise<any>;
}

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    aiInstance = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return aiInstance;
};

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  console.log("Server starting. GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
  console.log("Server starting. MESHY_API_KEY present:", !!process.env.MESHY_API_KEY);

  // =========================================================
  // Tripo3D API Endpoints (Primary Engine)
  // =========================================================
  app.post("/api/generate-3d", upload.single("file"), async (req, res) => {
    console.log("Received /api/generate-3d request (Tripo). File present:", !!req.file);
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      if (!TRIPO_API_KEY) {
        return res.status(500).json({ error: "TRIPO_API_KEY not configured" });
      }

      // 1. Upload image to Tripo
      const form = new FormData();
      form.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      const uploadResp = await axios.post(`${BASE_URL}/upload`, form, {
        headers: {
          Authorization: `Bearer ${TRIPO_API_KEY}`,
          ...form.getHeaders(),
        },
      });
      const imageToken = uploadResp.data.data.image_token;

      // 2. Create task
      const taskResp = await axios.post(
        `${BASE_URL}/task`,
        {
          type: "image_to_model",
          file: { type: "jpg", file_token: imageToken },
          model_version: "v2.5-20250123",
          texture: true,
          texture_quality: "standard",
        },
        {
          headers: {
            Authorization: `Bearer ${TRIPO_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      res.json({ task_id: taskResp.data.data.task_id, status: "processing" });
    } catch (error: any) {
      const tripoError = error.response?.data;
      console.error("Tripo Error:", tripoError || error.message);
      res.status(500).json({ error: tripoError?.message || error.message });
    }
  });

  app.get("/api/task/:task_id", async (req, res) => {
    try {
      const { task_id } = req.params;
      const resp = await axios.get(`${BASE_URL}/task/${task_id}`, {
        headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
      });
      const data = resp.data.data;
      console.log("Tripo task poll:", task_id, "status:", data.status);
      if (data.status === "success") {
        res.json({ status: "success", model_url: data.output.model, rendered_image: data.output.rendered_image });
      } else if (data.status === "failed") {
        res.status(500).json({ status: "failed", detail: "3D generation failed" });
      } else {
        res.json({ status: data.status, progress: data.progress || 0 });
      }
    } catch (error: any) {
      console.error("Task Status Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data || error.message });
    }
  });

  app.get("/api/proxy-model", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).send("URL required");
      console.log("Proxying model from:", url);
      const response = await axios.get(url as string, { responseType: "stream" });
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Access-Control-Allow-Origin", "*");
      response.data.pipe(res);
    } catch (error: any) {
      console.error("Proxy error:", error.message);
      res.status(500).send(error.message);
    }
  });
  //
  // app.post("/api/generate-3d-tripo", upload.single("file"), async (req, res) => {
  //   console.log("Received /api/generate-3d request (Tripo). File present:", !!req.file);
  //   try {
  //     if (!req.file) {
  //       return res.status(400).json({ error: "No file uploaded" });
  //     }
  //     if (!TRIPO_API_KEY) {
  //       return res.status(500).json({ error: "TRIPO_API_KEY not configured" });
  //     }
  //
  //     // 1. Upload image to Tripo
  //     const form = new FormData();
  //     form.append("file", req.file.buffer, {
  //       filename: req.file.originalname,
  //       contentType: req.file.mimetype,
  //     });
  //     const uploadResp = await axios.post(`${BASE_URL}/upload`, form, {
  //       headers: {
  //         Authorization: `Bearer ${TRIPO_API_KEY}`,
  //         ...form.getHeaders(),
  //       },
  //     });
  //     const imageToken = uploadResp.data.data.image_token;
  //
  //     // 2. Create task
  //     const taskResp = await axios.post(
  //       `${BASE_URL}/task`,
  //       {
  //         type: "image_to_model",
  //         file: { type: "jpg", file_token: imageToken },
  //         model_version: "v2.5-20250123",
  //         texture: true,
  //         texture_quality: "standard",
  //       },
  //       {
  //         headers: {
  //           Authorization: `Bearer ${TRIPO_API_KEY}`,
  //           "Content-Type": "application/json",
  //         },
  //       }
  //     );
  //     res.json({ task_id: taskResp.data.data.task_id, status: "processing" });
  //   } catch (error: any) {
  //     const tripoError = error.response?.data;
  //     console.error("Tripo Error:", tripoError || error.message);
  //     const errorMessage = tripoError?.message || error.message || "3D generation failed";
  //     res.status(500).json({ error: errorMessage });
  //   }
  // });
  //
  // app.get("/api/task-tripo/:task_id", async (req, res) => {
  //   try {
  //     const { task_id } = req.params;
  //     const resp = await axios.get(`${BASE_URL}/task/${task_id}`, {
  //       headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
  //     });
  //     const data = resp.data.data;
  //     if (data.status === "success") {
  //       res.json({ status: "success", model_url: data.output.model, rendered_image: data.output.rendered_image });
  //     } else if (data.status === "failed") {
  //       res.status(500).json({ status: "failed", detail: "3D generation failed" });
  //     } else {
  //       res.json({ status: data.status, progress: data.progress || 0 });
  //     }
  //   } catch (error: any) {
  //     console.error("Task Status Error:", error.response?.data || error.message);
  //     res.status(500).json({ error: error.response?.data || error.message });
  //   }
  // });

  // Gemini Endpoints
  app.post("/api/gemini/extract-product", async (req, res) => {
    console.log("Received /api/gemini/extract-product request");
    try {
      const { url } = req.body;
      const ai = getAI();
      const model = "gemini-3-flash-preview";
      
      const prompt = `Extract product information from this e-commerce URL: ${url}. 
      If you can't access the URL, provide a realistic mock response for a clothing item based on the URL's domain (e.g., Zara, Amazon, Myntra).
      Include title, brand, price, category (top, bottom, full, shoes), and a placeholder image URL.`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              brand: { type: Type.STRING },
              price: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['top', 'bottom', 'full', 'shoes'] },
              imageUrl: { type: Type.STRING },
            },
            required: ["title", "brand", "price", "category", "imageUrl"],
          },
        },
      });

      let text = response.text || "{}";
      // Sanitize markdown if present
      text = text.replace(/```json\n?|```/g, "").trim();
      console.log("Gemini Extract Response:", text);
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Gemini Extract Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini/estimate-measurements", async (req, res) => {
    console.log("Received /api/gemini/estimate-measurements request. Body size:", JSON.stringify(req.body).length);
    try {
      const { photoBase64 } = req.body;
      const ai = getAI();
      const model = "gemini-3-flash-preview";
      
      const prompt = `Analyze this person's photo and estimate their body measurements in cm for a 3D avatar creation. 
      Provide height, chest, waist, and hips. Be realistic but respectful.`;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: photoBase64 } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              height: { type: Type.NUMBER },
              chest: { type: Type.NUMBER },
              waist: { type: Type.NUMBER },
              hips: { type: Type.NUMBER },
            },
            required: ["height", "chest", "waist", "hips"],
          },
        },
      });

      let text = response.text || "{}";
      // Sanitize markdown if present
      text = text.replace(/```json\n?|```/g, "").trim();
      console.log("Gemini Estimate Response:", text);
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Gemini Estimate Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
