const mongoose = require('mongoose');

const trainSchema = new mongoose.Schema({
  train_number: { type: String, required: true },
  train_name: { type: String, required: true },
  source: { type: String, required: true },
  destination: { type: String, required: true },
  departure_time: { type: String, required: true },
  arrival_time: { type: String, required: true },
  duration: { type: String, required: true },
  on_time_pct_30d: { type: Number, required: true },
  on_time_pct_60d: { type: Number, required: true },
  on_time_pct_90d: { type: Number, required: true },
  avg_delay_minutes: { type: Number, required: true },
  punctuality_score: { type: Number, required: true },
  cleanliness_score: { type: Number, required: true }
});

module.exports = mongoose.model('Train', trainSchema);