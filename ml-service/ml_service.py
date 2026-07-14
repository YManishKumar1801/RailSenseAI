from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
from datetime import datetime

app = Flask(__name__)
CORS(app)


model = joblib.load("delay_model.pkl")
le_train = joblib.load("train_encoder.pkl")
le_day = joblib.load("day_encoder.pkl")

known_trains = set(le_train.classes_)


@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ML service is running", "known_trains": len(known_trains)})


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    train_number = str(data.get("train_number", ""))
    date_str = data.get("date", "")

    if not train_number or not date_str:
        return jsonify({"error": "train_number and date are required"}), 400

    if train_number not in known_trains:
        return jsonify({"error": f"Train {train_number} was not in the training data"}), 404

    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400

    day_of_week = date_obj.strftime("%A")
    month = date_obj.month

    
    if day_of_week not in le_day.classes_:
        return jsonify({"error": f"Unrecognized day: {day_of_week}"}), 400

    train_encoded = le_train.transform([train_number])[0]
    day_encoded = le_day.transform([day_of_week])[0]

    features = pd.DataFrame([[train_encoded, day_encoded, month]],
                             columns=["train_encoded", "day_encoded", "month"])

    predicted_delay = model.predict(features)[0]

    return jsonify({
        "train_number": train_number,
        "date": date_str,
        "day_of_week": day_of_week,
        "predicted_delay_minutes": round(float(predicted_delay), 1)
    })


if __name__ == "__main__":
    print(f"ML service starting. Loaded model with {len(known_trains)} known trains.")
    app.run(port=5001, debug=False)