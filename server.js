import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const subscriptions = [];

dotenv.config();

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());



app.post("/api/translate", async (req, res) => {
  console.log("---- /api/translate called ----");

  try {
    const { text, to } = req.body;
    console.log("Incoming body:", req.body);

    if (!text || !to) {
      console.log("Missing text or to");
      return res.status(400).json({ error: "text and to are required" });
    }

    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;

    console.log("Endpoint:", endpoint);
    console.log("Region:", region);
    console.log("Target language:", to);

    const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
    console.log("Azure URL:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Ocp-Apim-Subscription-Region": region,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ Text: text }])
    });

    console.log("Azure status:", response.status);

    const rawText = await response.text();
    console.log("Azure raw response:", rawText);

    if (!response.ok) {
      return res.status(response.status).json({ error: rawText });
    }

    const data = JSON.parse(rawText);
    const translated = data?.[0]?.translations?.[0]?.text;

    console.log("Translated text:", translated);

    res.json({ translated });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: error.message });
  }
});

function mapUnescoRecord(record) {
  const longText =
    record.short_description_en ||
    `UNESCO World Heritage site in ${record.states_names?.[0] || "an unknown location"}.`;

  const shortText =
    longText.length > 140 ? `${longText.slice(0, 140)}...` : longText;

  return {
    id: record.uuid || record.id_no,
    name: record.name_en || "Unknown site",
    city: record.states_names?.[0] || "Unknown location",
    country: record.states_names?.[0] || "Unknown location",
    shortText,
    longText,
    unescoUrl: record.id_no
      ? `https://whc.unesco.org/en/list/${record.id_no}/`
      : "https://whc.unesco.org/en/list/",
    lat: record.coordinates?.lat ?? null,
    lng: record.coordinates?.lon ?? null,
    category: record.category || "Unknown"
  };
}

app.get("/api/heritage", async (req, res) => {
  try {
    const allResults = [];
    const limit = 100;
    let offset = 0;
    let keepGoing = true;

    while (keepGoing) {
      const url = `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=${limit}&offset=${offset}`;

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      const results = data.results || [];

      allResults.push(...results);

      if (results.length < limit) {
        keepGoing = false;
      } else {
        offset += limit;
      }
    }

    const mappedSites = allResults
      .map(mapUnescoRecord)
      .filter(site => site.lat !== null && site.lng !== null);

    res.json(mappedSites);
  } catch (error) {
    console.error("UNESCO fetch error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/subscription/prepare", async (req, res) => {
  try {
    const { phoneNumber, radiusKm } = req.body;

    if (!phoneNumber || !radiusKm) {
      return res.status(400).json({ error: "phoneNumber och radiusKm krävs" });
    }

    if (
      !process.env.KLARNA_BASE_URL ||
      !process.env.KLARNA_USERNAME ||
      !process.env.KLARNA_PASSWORD
    ) {
      return res.status(500).json({ error: "Klarna credentials saknas i .env" });
    }

    const subscriptionId = crypto.randomUUID();

    subscriptions.push({
      id: subscriptionId,
      phoneNumber,
      radiusKm: Number(radiusKm),
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date().toISOString()
    });

    const klarnaResponse = await fetch(
      `${process.env.KLARNA_BASE_URL}/payments/v1/sessions`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${process.env.KLARNA_USERNAME}:${process.env.KLARNA_PASSWORD}`
            ).toString("base64"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          purchase_country: "SE",
          purchase_currency: "SEK",
          locale: "sv-SE",
          order_amount: 900,
          order_tax_amount: 0,
          order_lines: [
            {
              name: "SMS-prenumeration världsarv",
              quantity: 1,
              unit_price: 900,
              total_amount: 900,
              tax_rate: 0,
              total_tax_amount: 0
            }
          ]
        })
      }
    );

    const rawText = await klarnaResponse.text();
    console.log("Klarna raw response:", rawText);

    let klarnaData = {};
    if (rawText) {
      try {
        klarnaData = JSON.parse(rawText);
      } catch {
        klarnaData = { rawText };
      }
    }

    if (!klarnaResponse.ok) {
      return res.status(klarnaResponse.status).json({
        error: "Klarna error",
        details: klarnaData
      });
    }

    res.json({
      clientToken: klarnaData.client_token,
      sessionId: klarnaData.session_id,
      paymentMethodCategories: klarnaData.payment_method_categories || [],
      subscriptionId
    });
  } catch (error) {
    console.error("Prepare subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

  

    // Klarna request
    const klarnaResponse = await fetch(
      `${process.env.KLARNA_BASE_URL}/payments/v1/sessions`,
  {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.KLARNA_USERNAME}:${process.env.KLARNA_PASSWORD}`
        ).toString("base64"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      purchase_country: "SE",
      purchase_currency: "SEK",
      locale: "sv-SE",

      order_amount: 900,
      order_tax_amount: 0,

      order_lines: [
        {
          name: "SMS-prenumeration världsarv",
          quantity: 1,
          unit_price: 900,
          total_amount: 900,
          tax_rate: 0,
          total_tax_amount: 0
        }
      ]
    })
  }
);

app.post("/api/subscription/activate", (req, res) => {
  try {
    const { subscriptionId } = req.body;

    const subscription = subscriptions.find(s => s.id === subscriptionId);

    if (!subscription) {
      return res.status(404).json({ error: "Prenumeration hittades inte" });
    }

    subscription.status = "active";
    subscription.paymentStatus = "paid";
    subscription.activatedAt = new Date().toISOString();

    res.json({
      message: "Prenumeration aktiverad",
      subscription
    });
  } catch (error) {
    console.error("Activate subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/subscriptions", (req, res) => {
  res.json(subscriptions);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});