import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

np.random.seed(42)

print("Fetching current train list from backend...")
response = requests.get("http://localhost:5000/api/trains")
trains = response.json()
print(f"Got {len(trains)} trains.")

rows = []
today = datetime.today()

for train in trains:
    train_number = train["train_number"]
    train_name = train["train_name"]
    source = train["source"]
    destination = train["destination"]


    base_avg_delay = train["avg_delay_minutes"]
    base_score = train["punctuality_score"]
    on_time_chance = base_score / 100

    for days_ago in range(90, 0, -1):
        date = today - timedelta(days=days_ago)
        month = date.month

        
        season_penalty = 0.15 if month in [12, 1] else 0.0
        daily_on_time_chance = max(0.1, on_time_chance - season_penalty)

        is_on_time = np.random.random() < daily_on_time_chance

        if is_on_time:
            delay_minutes = max(0, int(np.random.normal(base_avg_delay * 0.3, 5)))
        else:
            delay_minutes = int(np.random.normal(base_avg_delay * 1.8, 15))
            delay_minutes = max(10, delay_minutes)

        rows.append({
            "train_number": train_number,
            "train_name": train_name,
            "source": source,
            "destination": destination,
            "date": date.strftime("%Y-%m-%d"),
            "day_of_week": date.strftime("%A"),
            "month": month,
            "delay_minutes": delay_minutes,
            "on_time": 1 if delay_minutes <= 15 else 0
        })

df = pd.DataFrame(rows)
df.to_csv("historical_data.csv", index=False)

print(f"\nDone! Created historical_data.csv with {len(df)} rows.")
print(f"Covers {len(trains)} trains, 90 days each.")