require('dotenv').config();
const mongoose = require('mongoose');
const Train = require('./models/Train');


const cityCoords = {
  "Delhi": { lat: 28.6139, lon: 77.2090 },
  "Mumbai": { lat: 19.0760, lon: 72.8777 },
  "Kolkata": { lat: 22.5726, lon: 88.3639 },
  "Chennai": { lat: 13.0827, lon: 80.2707 },
  "Bangalore": { lat: 12.9716, lon: 77.5946 },
  "Hyderabad": { lat: 17.3850, lon: 78.4867 },
  "Pune": { lat: 18.5204, lon: 73.8567 },
  "Ahmedabad": { lat: 23.0225, lon: 72.5714 },
  "Jaipur": { lat: 26.9124, lon: 75.7873 },
  "Lucknow": { lat: 26.8467, lon: 80.9462 },
};
const metroCities = Object.keys(cityCoords);


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


const windowProfiles = [
  { d30: 80, d60: 85, d90: 92 }, 
  { d30: 90, d60: 76, d90: 60 },  
  { d30: 68, d60: 90, d90: 74 },  
];


function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


function estimateDurationMinutes(source, destination, speedFactor) {
  const a = cityCoords[source];
  const b = cityCoords[destination];
  const straightLineKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
  const railDistanceKm = straightLineKm * 1.2; 
  const avgSpeedKmph = 55 * speedFactor;        
  const hours = railDistanceKm / avgSpeedKmph;
  let minutes = Math.round(hours * 60 / 15) * 15;
  return Math.max(90, minutes); 
}

function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function randomDepartureTime() {
  const hour = Math.floor(Math.random() * 24).toString().padStart(2, "0");
  const min = [0, 15, 30, 45][Math.floor(Math.random() * 4)].toString().padStart(2, "0");
  return { hour: parseInt(hour), min: parseInt(min), label: `${hour}:${min}` };
}


function computeArrivalTime(departure, durationMinutes) {
  const totalStartMinutes = departure.hour * 60 + departure.min;
  const totalArrivalMinutes = (totalStartMinutes + durationMinutes) % (24 * 60);
  const h = Math.floor(totalArrivalMinutes / 60).toString().padStart(2, "0");
  const m = (totalArrivalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function threeTrainsForRoute(source, destination) {
  const key = `${source}-${destination}`;
  
  const speedFactors = [1.10, 0.95, 1.00]; 

  const trains = [];
  windowProfiles.forEach((profile, i) => {
    let number, name;
    if (i === 0 && namedTrainOverrides[key]) {
      
      [number, name] = namedTrainOverrides[key];
    } else {
      number = (trainCounter++).toString();
      const type = trainTypes[Math.floor(Math.random() * trainTypes.length)];
      name = `${source}-${destination} ${type}`;
    }

    const departure = randomDepartureTime();
    const durationMinutes = estimateDurationMinutes(source, destination, speedFactors[i]);
    const arrival = computeArrivalTime(departure, durationMinutes);

    trains.push([
      number, name, source, destination,
      departure.label, arrival, formatDuration(durationMinutes),
      profile
    ]);
  });

  return trains;
}


let trainsData = [];
for (const source of metroCities) {
  for (const destination of metroCities) {
    if (source === destination) continue;
    trainsData = trainsData.concat(threeTrainsForRoute(source, destination));
  }
}

function generateScores(profile) {
  const jitter = () => (Math.random() * 6) - 3;
  const on_time_pct_30d = Math.min(99, Math.max(10, profile.d30 + jitter()));
  const on_time_pct_60d = Math.min(99, Math.max(10, profile.d60 + jitter()));
  const on_time_pct_90d = Math.min(99, Math.max(10, profile.d90 + jitter()));

  
  const avg_delay_minutes = Math.round((100 - on_time_pct_30d) * 0.5 + Math.random() * 6);

  const punctuality_score = Math.round(
    (0.5 * on_time_pct_30d) + (0.3 * on_time_pct_60d) + (0.2 * on_time_pct_90d)
  );

  const isPremium = profile.d90 >= 85;
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
    const records = trainsData.map(([number, name, source, dest, dep, arr, duration, profile]) => {
      const scores = generateScores(profile);
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
    console.log(`Durations are now based on real geographic distance between cities.`);

    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err.message);
    process.exit(1);
  }
}

seedDatabase();