require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const Train = require('./models/Train');

const app = express();
app.use(cors());
app.use(express.json());


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err.message));


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = "gemini-flash-latest";


async function generateWithRetry(params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const isOverloaded = err.message && (err.message.includes('503') || err.message.includes('UNAVAILABLE'));
      if (isOverloaded && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // wait 1s, then 2s
        continue;
      }
      throw err;
    }
  }
}


app.get('/', (req, res) => {
  res.json({ message: "RailSense AI backend is running!" });
});


app.get('/api/trains', async (req, res) => {
  try {
    const trains = await Train.find().sort({ punctuality_score: -1 });
    res.json(trains);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/trains/:number', async (req, res) => {
  try {
    const train = await Train.findOne({ train_number: req.params.number });
    if (!train) return res.status(404).json({ error: "Train not found" });
    res.json(train);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/search', async (req, res) => {
  try {
    const { source, destination } = req.query;
    if (!source || !destination) {
      return res.status(400).json({ error: "Please provide both source and destination" });
    }
    const trains = await Train.find({
      source: new RegExp(`^${source}$`, 'i'),
      destination: new RegExp(`^${destination}$`, 'i')
    }).sort({ punctuality_score: -1 });

    if (trains.length === 0) {
      return res.json({ message: "No trains found for this route in our dataset", trains: [] });
    }
    res.json({
      message: `Found ${trains.length} train(s) from ${source} to ${destination}`,
      recommended: trains[0],
      trains: trains
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    
    const allTrains = await Train.find();
    const knownStations = [...new Set(allTrains.flatMap(t => [t.source, t.destination]))];

    
    const extractionPrompt = `You are an entity extractor for an Indian train search app.
Known stations: ${knownStations.join(", ")}

From the user's message, extract:
- source: the departure station (must match one of the known stations, or null)
- destination: the arrival station (must match one of the known stations, or null)
- train_number: a 5-digit train number if mentioned, or null
- train_name: if the user mentions a specific train BY NAME (e.g. "Grand Trunk Express", "Rajdhani", "Tamil Nadu Express") rather than a route or number, extract that name as text. Otherwise null.
- time_window: if the user specifically asks about "last 30 days", "past 60 days", "90 days", etc., extract the number (30, 60, or 90). Otherwise null.

User message: "${message}"

Respond with ONLY a JSON object, no markdown, no explanation. Example:
{"source": "Delhi", "destination": "Mumbai", "train_number": null, "train_name": null, "time_window": null}`;

    const extractionResponse = await generateWithRetry({
      model: GEMINI_MODEL,
      contents: extractionPrompt
    });

    let extracted;
    try {
      const cleanText = extractionResponse.text.replace(/```json|```/g, '').trim();
      extracted = JSON.parse(cleanText);
    } catch (parseErr) {
      return res.json({ reply: "I couldn't understand that. Try something like 'Delhi to Mumbai', a train name, or a 5-digit train number.", trains: [] });
    }

    
    let trains = [];
    let queryContext = "";

    if (extracted.train_number) {
      const train = await Train.findOne({ train_number: extracted.train_number });
      if (train) {
        trains = [train];
        queryContext = `Train ${train.train_number} (${train.train_name}) data: ${JSON.stringify(train)}`;
      } else {
        queryContext = `No train found with number ${extracted.train_number}.`;
      }
    } else if (extracted.train_name) {
      trains = await Train.find({
        train_name: new RegExp(extracted.train_name, 'i')
      }).sort({ punctuality_score: -1 });
      queryContext = trains.length > 0
        ? `Trains matching name "${extracted.train_name}": ${JSON.stringify(trains)}`
        : `No train found matching the name "${extracted.train_name}".`;
    } else if (extracted.source && extracted.destination) {
      const sortField = extracted.time_window === 30 ? 'on_time_pct_30d'
        : extracted.time_window === 60 ? 'on_time_pct_60d'
        : extracted.time_window === 90 ? 'on_time_pct_90d'
        : 'punctuality_score';

      trains = await Train.find({
        source: new RegExp(`^${extracted.source}$`, 'i'),
        destination: new RegExp(`^${extracted.destination}$`, 'i')
      }).sort({ [sortField]: -1 });

      const windowLabel = extracted.time_window ? ` based on the last ${extracted.time_window} days` : "";
      queryContext = trains.length > 0
        ? `Trains from ${extracted.source} to ${extracted.destination}${windowLabel}: ${JSON.stringify(trains)}. ${extracted.time_window ? `Rank and recommend based specifically on the on_time_pct_${extracted.time_window}d field.` : ""}`
        : `No trains found from ${extracted.source} to ${extracted.destination}.`;
    } else {
      return res.json({
        reply: "Please mention a source and destination station (e.g. 'Delhi to Mumbai'), a train name, or a 5-digit train number.",
        trains: []
      });
    }

 
    const replyPrompt = `You are RailSense AI, a friendly train recommendation assistant.
Based on this data: ${queryContext}

Write a short (2-4 sentence) natural language response recommending the best option and briefly explaining why (mention punctuality score and typical delay if relevant). ${extracted.time_window ? `The user specifically asked about the last ${extracted.time_window} days, so reference that window's on-time percentage explicitly.` : ""} If no trains were found, say so politely. Do not use markdown formatting.`;

    const replyResponse = await generateWithRetry({
      model: GEMINI_MODEL,
      contents: replyPrompt
    });

    res.json({
      reply: replyResponse.text,
      trains: trains,
      context: {
        source: extracted.source || null,
        destination: extracted.destination || null,
        train_name: extracted.train_name || null,
        train_number: extracted.train_number || null
      }
    });

  } catch (err) {
    console.error("Chat error:", err.message);
    const isOverloaded = err.message && (err.message.includes('503') || err.message.includes('UNAVAILABLE'));
    const friendlyMessage = isOverloaded
      ? "The AI assistant is temporarily busy (this is a Google server issue, not a bug). Please try again in a few seconds."
      : "Something went wrong with the AI assistant.";
    res.status(500).json({ error: friendlyMessage, details: err.message });
  }
});


app.post('/api/predict-delay', async (req, res) => {
  try {
    const { train_number, date } = req.body;
    if (!train_number || !date) {
      return res.status(400).json({ error: "train_number and date are required" });
    }

    const mlResponse = await fetch('http://localhost:5001/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ train_number, date })
    });

    if (!mlResponse.ok) {
      const errData = await mlResponse.json();
      return res.status(mlResponse.status).json(errData);
    }

    const result = await mlResponse.json();
    res.json(result);
  } catch (err) {
   
    res.status(503).json({ error: "ML prediction service unavailable", details: err.message });
  }
});


app.get('/api/analytics', async (req, res) => {
  try {
    const allTrains = await Train.find();

    if (allTrains.length === 0) {
      return res.json({ topTrains: [], bottomTrains: [], riskDistribution: {}, avgOnTime: {} });
    }

    const sorted = [...allTrains].sort((a, b) => b.punctuality_score - a.punctuality_score);
    const topTrains = sorted.slice(0, 10).map(t => ({ name: t.train_name, score: t.punctuality_score }));
    const bottomTrains = sorted.slice(-10).reverse().map(t => ({ name: t.train_name, score: t.punctuality_score }));

    
    let safe = 0, moderate = 0, risky = 0;
    allTrains.forEach(t => {
      if (t.punctuality_score >= 80) safe++;
      else if (t.punctuality_score >= 60) moderate++;
      else risky++;
    });

   
    const avg30 = allTrains.reduce((sum, t) => sum + t.on_time_pct_30d, 0) / allTrains.length;
    const avg60 = allTrains.reduce((sum, t) => sum + t.on_time_pct_60d, 0) / allTrains.length;
    const avg90 = allTrains.reduce((sum, t) => sum + t.on_time_pct_90d, 0) / allTrains.length;

    res.json({
      topTrains,
      bottomTrains,
      riskDistribution: { safe, moderate, risky },
      avgOnTime: {
        "30d": Math.round(avg30 * 10) / 10,
        "60d": Math.round(avg60 * 10) / 10,
        "90d": Math.round(avg90 * 10) / 10
      },
      totalTrains: allTrains.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});