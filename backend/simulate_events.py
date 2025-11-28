import time
import random
from datetime import datetime, timedelta

from database import init_db, insert_motion_event


def simulate_last_hours(hours: int = 4, events_per_hour: int = 30):
    """
    Fill the database with simulated events for the last `hours` hours.
    """
    now = int(time.time())
    start = now - hours * 3600

    total_events = hours * events_per_hour
    for _ in range(total_events):
        ts = random.randint(start, now)
        insert_motion_event(ts)


def simulate_live_loop(interval_seconds: float = 5.0):
    """
    Generate real-time events every `interval_seconds` seconds.
    """
    while True:
        ts = int(time.time())
        insert_motion_event(ts)
        print(f"[SIMULATOR] Inserted event at {ts}")
        time.sleep(interval_seconds)


if __name__ == "__main__":
    init_db()
    # 1) Fill a recent history
    simulate_last_hours(hours=6, events_per_hour=40)
    # 2) Keep generating real-time events
    simulate_live_loop(interval_seconds=5)
