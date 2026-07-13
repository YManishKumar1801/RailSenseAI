"""
Step 2 (ML): Train a Random Forest model to predict delay from historical data.

HOW TO RUN:
1. Save this file as train_ml_model.py inside the ml-service folder
2. Make sure historical_data.csv already exists (from generate_historical_data.py)
3. In terminal (inside ml-service folder), run: python train_ml_model.py
4. It creates: delay_model.pkl, train_encoder.pkl, day_encoder.pkl
"""

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import LabelEncoder
import joblib

print("Loading historical data...")
df = pd.read_csv("historical_data.csv", dtype={"train_number": str})
print(f"Loaded {len(df)} rows.\n")

# ---- Encode categorical features into numbers ----
le_train = LabelEncoder()
le_day = LabelEncoder()

df["train_encoded"] = le_train.fit_transform(df["train_number"])
df["day_encoded"] = le_day.fit_transform(df["day_of_week"])

features = ["train_encoded", "day_encoded", "month"]
X = df[features]
y = df["delay_minutes"]

# ---- Split into training (80%) and testing (20%) ----
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# ---- Train the model ----
print("Training Random Forest model... (this may take 10-20 seconds)")
model = RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42)
model.fit(X_train, y_train)

# ---- Evaluate ----
predictions = model.predict(X_test)
mae = mean_absolute_error(y_test, predictions)
print(f"\nModel trained! Average prediction error: {mae:.1f} minutes")
print("(On average, predictions are off by this many minutes from actual - lower is better)\n")

# ---- Save the model and encoders ----
joblib.dump(model, "delay_model.pkl")
joblib.dump(le_train, "train_encoder.pkl")
joblib.dump(le_day, "day_encoder.pkl")

print("Saved: delay_model.pkl, train_encoder.pkl, day_encoder.pkl")
print("\nModel is ready to use for predictions.")