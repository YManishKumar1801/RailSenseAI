require('dotenv').config();
const mongoose = require('mongoose');
const Train = require('./models/Train');

// ---- 10 Metro Cities ----
const metroCities = [
  "Delhi", "Mumbai", "Kolkata", "Chennai", "Bangalore",
  "Hyderabad", "Pune", "Ahmedabad", "Jaipur", "Lucknow"
];

// Real named trains kept for realism, mapped to their route if it matches
const namedTrainOverrides = {
  "Mumbai-Delhi": ["12951", "Mumbai Rajdhani"],
  "Kolkata-Delhi": ["12301", "Howrah Rajdhani"],
  "Delhi-Chennai": ["12621", "Tamil Nadu Express"],
  "Delhi-Hyderabad": ["12723", "Telangana Express"],
  "Kolkata-Chennai": ["12841", "Coromandel Express"],
  "Ahmedabad-Delhi": ["12915", "Ashram Express"],
  "Delhi-Bangalore": ["12649", "Karnataka Sampark"],
  "Bangalore-Delhi": ["12429", "Rajdhani Express"],
  "Delhi-Kolkata": ["12259", "Sealdah Duronto"],
  "Mumbai-Ahmedabad": ["12009", "Shatabdi Express"],
};

const trainTypes = ["Express", "SF Express", "Superfast", "Jan Shatabdi", "Intercity", "Mail Express", "Duronto"];

let trainCounter = 13001;

function randomTime() {
  const hour = Math.floor(Math.random() * 24).toString().padStart(2, "0");
  const min = [0, 15, 30, 45][Math.floor(Math.random() * 4)].toString().padStart(2, "0");
  return `${hour}:${min}`;
}

function randomDuration() {
  const totalHours = 4 + Math.floor(Math.random() * 30);
  const extraMin = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
  return `${totalHours}h ${extraMin.toString().padStart(2, "0")}m`;
}

// Generates exactly 3 trains for a route: one reliable, one average, one poor
function threeTrainsForRoute(source, destination) {
  const key = `${source}-${destination}`;
  const tiers = [
    0.85 + Math.random() * 0.10,  // ~85-95% - reliable
    0.60 + Math.random() * 0.15,  // ~60-75% - average
    0.35 + Math.random() * 0.15,  // ~35-50% - poor
  ];

  const trains = [];
  tiers.forEach((reliability, i) => {
    let number, name;
    if (i === 0 && namedTrainOverrides[key]) {
      [number, name] = namedTrainOverrides[key];
    } else {
      number = (trainCounter++).toString();
      const type = trainTypes[Math.floor(Math.random() * trainTypes.length)];
      name = `${source}-${destination} ${type}`;
    }

    trains.push([
      number, name, source, destination,
      randomTime(), randomTime(), randomDuration(),
      Math.round(reliability * 100) / 100
    ]);
  });

  return trains;
}

// ---- Build full dataset: every ordered pair among the 10 metro cities ----
let trainsData = [];
for (const source of metroCities) {
  for (const destination of metroCities) {
    if (source === destination) continue;
    trainsData = trainsData.concat(threeTrainsForRoute(source, destination));
  }
}

// ---- Score calculation ----
function generateScores(baseReliability) {
  const jitter = () => (Math.random() * 6) - 3;
  const on_time_pct_30d = Math.min(99, Math.max(10, baseReliability * 100 + jitter()));
  const on_time_pct_60d = Math.min(99, Math.max(10, baseReliability * 100 + jitter()));
  const on_time_pct_90d = Math.min(99, Math.max(10, baseReliability * 100 + jitter()));

  const avg_delay_minutes = Math.round((1 - baseReliability) * 60 + Math.random() * 8);

  const punctuality_score = Math.round(
    (0.5 * on_time_pct_30d) + (0.3 * on_time_pct_60d) + (0.2 * on_time_pct_90d)
  );

  const isPremium = baseReliability >= 0.8;
  const cleanliness_score = isPremium
    ? Math.round(80 + Math.random() * 15)
    : Math.round(45 + Math.random() * 30);

  return {
    on_time_pct_30d: Math.round(on_time_pct_30d * 10) / 10,
    on_time_pct_60d: Math.round(on_time_pct_60d * 10) / 10,
    on_time_pct_90d: Math.round(on_time_pct_90d * 10) / 10,
    avg_delay_minutes,
    punctuality_score,
    cleanliness_score
  };
}

async function seedDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected!");

    console.log("Clearing old data...");
    await Train.deleteMany({});

    console.log(`Generating and inserting ${trainsData.length} train records...`);
    const records = trainsData.map(([number, name, source, dest, dep, arr, duration, reliability]) => {
      const scores = generateScores(reliability);
      return {
        train_number: number,
        train_name: name,
        source,
        destination: dest,
        departure_time: dep,
        arrival_time: arr,
        duration,
        ...scores
      };
    });

    await Train.insertMany(records);
    console.log(`Success! Inserted ${records.length} trains into the database.`);
    console.log(`Covers all ${metroCities.length} metro cities, every route has 3 trains.`);

    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err.message);
    process.exit(1);
  }
}

seedDatabase();