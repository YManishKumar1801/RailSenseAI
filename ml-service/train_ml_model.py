import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import LabelEncoder
import joblib

print("Loading historical data...")
df = pd.read_csv("historical_data.csv", dtype={"train_number": str})
print(f"Loaded {len(df)} rows.\n")


le_train = LabelEncoder()
le_day = LabelEncoder()

df["train_encoded"] = le_train.fit_transform(df["train_number"])
df["day_encoded"] = le_day.fit_transform(df["day_of_week"])

features = ["train_encoded", "day_encoded", "month"]
X = df[features]
y = df["delay_minutes"]


X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)


print("Training Random Forest model... (this may take 10-20 seconds)")
model = RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42)
model.fit(X_train, y_train)


predictions = model.predict(X_test)
mae = mean_absolute_error(y_test, predictions)
print(f"\nModel trained! Average prediction error: {mae:.1f} minutes")
print("(On average, predictions are off by this many minutes from actual - lower is better)\n")


joblib.dump(model, "delay_model.pkl")
joblib.dump(le_train, "train_encoder.pkl")
joblib.dump(le_day, "day_encoder.pkl")

print("Saved: delay_model.pkl, train_encoder.pkl, day_encoder.pkl")
print("\nModel is ready to use for predictions.")