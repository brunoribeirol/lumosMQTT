import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

# Use env var in Docker and local file when running directly
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "lumos.db"))


def get_connection() -> sqlite3.Connection:
    """
    Create and return a SQLite connection with row_factory set to Row.
    """
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Initialize the SQLite database and create the motion_events table
    if it does not exist.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS motion_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            hour INTEGER NOT NULL,
            day TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()


def insert_motion_event(timestamp: int) -> None:
    """
    Insert a new motion event into the database.

    :param timestamp: Unix timestamp (in seconds) when the event occurred.
    """
    dt = datetime.fromtimestamp(timestamp)
    hour = dt.hour
    day = dt.strftime("%Y-%m-%d")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO motion_events (timestamp, hour, day) VALUES (?, ?, ?)",
        (timestamp, hour, day),
    )
    conn.commit()
    conn.close()


def get_daily_count(day: str) -> int:
    """
    Return the number of motion events for a given day (YYYY-MM-DD).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) AS total FROM motion_events WHERE day = ?",
        (day,),
    )
    total = cursor.fetchone()["total"]
    conn.close()
    return total


def get_total_count() -> int:
    """
    Return the total number of motion events in the database.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS total FROM motion_events")
    total = cursor.fetchone()["total"]
    conn.close()
    return total


def get_hourly_distribution(day: str) -> Dict[int, int]:
    """
    Return a dict {hour: count} representing how many events occurred
    at each hour of a given day (YYYY-MM-DD).
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT hour, COUNT(*) AS total
        FROM motion_events
        WHERE day = ?
        GROUP BY hour
        ORDER BY hour ASC
        """,
        (day,),
    )
    results = cursor.fetchall()
    conn.close()
    return {row["hour"] as int: row["total"] for row in results}  # type: ignore[union-attr]


def get_peak_hour(day: str) -> Optional[int]:
    """
    Return the hour (0-23) with the highest number of events for a given day,
    or None if there are no events on that day.
    """
    distribution = get_hourly_distribution(day)
    if not distribution:
        return None
    peak = max(distribution, key=distribution.get)
    return peak


def get_events_for_day(day: str) -> List[sqlite3.Row]:
    """
    Return all events for a given day (YYYY-MM-DD),
    ordered by timestamp ascending.
    Each row has fields: id, timestamp, hour, day.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, timestamp, hour, day
        FROM motion_events
        WHERE day = ?
        ORDER BY timestamp ASC
        """,
        (day,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_daily_counts_for_range(start_day: str, end_day: str) -> Dict[str, int]:
    """
    Return a dict {day_str: count} with the number of events per day
    in the inclusive range [start_day, end_day], where the dates are
    in the format YYYY-MM-DD.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT day, COUNT(*) AS total
        FROM motion_events
        WHERE day BETWEEN ? AND ?
        GROUP BY day
        ORDER BY day ASC
        """,
        (start_day, end_day),
    )
    rows = cursor.fetchall()
    conn.close()
    return {row["day"]: row["total"] for row in rows}


def get_events(limit: Optional[int] = None) -> List[sqlite3.Row]:
    """
    Return recent motion events ordered by timestamp DESC.

    :param limit: Optional maximum number of events.
    """
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT id, timestamp, hour, day
        FROM motion_events
        ORDER BY timestamp DESC
    """
    params: tuple = ()
    if limit is not None:
        query += " LIMIT ?"
        params = (limit,)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return rows
