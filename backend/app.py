import json
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, render_template, request, Response
from flask_cors import CORS
from flasgger import Swagger
import paho.mqtt.client as mqtt

from database import (
    init_db,
    insert_motion_event,
    get_daily_count,
    get_hourly_distribution,
    get_peak_hour,
    get_total_count,
    get_events_for_day,
    get_daily_counts_for_range,
    get_events,
)

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# MQTT broker (CloudMQP / LavinMQ or similar).
# These values are provided via environment variables in Render.
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")

# Topic used by the ESP32 to send motion events
MQTT_TOPIC_MOTION = os.getenv("MQTT_TOPIC_MOTION", "lumosMQTT/motion")

# Motion window on the ESP32 (in seconds) – must match MOTION_WINDOW_MS / 1000
MOTION_WINDOW_SECONDS = 3

# LED power estimation (for energy metrics)
LED_POWER_HIGH_W = 3.0
LED_POWER_LOW_W = 0.5

# Session gap: max time (in seconds) between consecutive events to consider
# them part of the same "presence session"
SESSION_GAP_SECONDS = 120

# -----------------------------------------------------------------------------
# Logging setup
# -----------------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
numeric_level = getattr(logging, LOG_LEVEL, logging.INFO)

logging.basicConfig(
    level=numeric_level,
    format="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("lumosMQTT-backend")

# -----------------------------------------------------------------------------
# MQTT Callbacks
# -----------------------------------------------------------------------------


def on_connect(client: mqtt.Client, userdata, flags, rc):
    """
    Called when the MQTT client connects to the broker.
    Subscribes to the motion events topic.
    """
    if rc == 0:
        logger.info("Connected to MQTT broker %s:%s", MQTT_BROKER_HOST, MQTT_PORT)
        client.subscribe(MQTT_TOPIC_MOTION)
        logger.info("Subscribed to motion topic: %s", MQTT_TOPIC_MOTION)
    else:
        logger.error("Failed to connect to MQTT broker. Return code: %s", rc)


def handle_motion_message(payload_str: str) -> None:
    """
    Handle messages from the motion topic.

    Expected payload from ESP32:
        { "timestamp": 1732708465 }

    For analytics we use the server time as canonical timestamp.
    The device timestamp is kept only for logging purposes.
    """
    device_timestamp: Optional[int] = None

    try:
        if payload_str.strip():
            data = json.loads(payload_str)
            if "timestamp" in data:
                device_timestamp = int(data["timestamp"])
    except (json.JSONDecodeError, ValueError, TypeError):
        device_timestamp = None

    event_ts = int(time.time())
    insert_motion_event(event_ts)

    if device_timestamp is not None:
        logger.info(
            "Stored motion event at ts=%s (device_timestamp=%s)",
            event_ts,
            device_timestamp,
        )
    else:
        logger.info(
            "Stored motion event at ts=%s (no valid device timestamp)", event_ts
        )


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):
    """
    General MQTT message handler – routes messages by topic.
    """
    try:
        payload_str = msg.payload.decode("utf-8")

        if msg.topic == MQTT_TOPIC_MOTION:
            handle_motion_message(payload_str)
        else:
            logger.info("MQTT message on unknown topic %s: %s", msg.topic, payload_str)

    except Exception as exc:  # safety net
        logger.exception("Unexpected error while processing MQTT message: %s", exc)


def start_mqtt_client() -> None:
    """
    Start the MQTT client and block with loop_forever().
    This is meant to run in a background thread.
    """
    client = mqtt.Client()

    # If the broker requires authentication (CloudAMQP / LavinMQ),
    # set username and password here.
    if MQTT_USERNAME and MQTT_PASSWORD:
        logger.info("Configuring MQTT auth with username=%s", MQTT_USERNAME)
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    else:
        logger.info("Starting MQTT client WITHOUT authentication")

    client.on_connect = on_connect
    client.on_message = on_message

    logger.info(
        "Connecting to MQTT broker at %s:%s...",
        MQTT_BROKER_HOST,
        MQTT_PORT,
    )
    client.connect(MQTT_BROKER_HOST, MQTT_PORT, keepalive=60)

    client.loop_forever()


# -----------------------------------------------------------------------------
# Analytics helpers
# -----------------------------------------------------------------------------


def _get_day_bounds(day: date, is_today: bool) -> Tuple[int, int]:
    """
    Return (start_ts, end_ts) in Unix seconds for the given day.

    If is_today=True, end_ts is "now". Otherwise, end_ts is midnight+24h.
    """
    start_dt = datetime.combine(day, datetime.min.time())
    start_ts = int(start_dt.timestamp())

    if is_today:
        end_ts = int(time.time())
    else:
        end_dt = start_dt + timedelta(days=1)
        end_ts = int(end_dt.timestamp())

    return start_ts, end_ts


def build_sessions_for_day(day: date) -> List[Dict[str, Any]]:
    """
    Build presence sessions for the given day.

    A session is a continuous interval of motion events where the gap
    between consecutive events is less than or equal to SESSION_GAP_SECONDS.
    """
    day_str = day.strftime("%Y-%m-%d")
    rows = get_events_for_day(day_str)

    if not rows:
        return []

    timestamps = [int(row["timestamp"]) for row in rows]
    sessions: List[Dict[str, Any]] = []

    current_start = timestamps[0]
    current_end = timestamps[0]

    for ts in timestamps[1:]:
        if ts - current_end <= SESSION_GAP_SECONDS:
            # Same session, extend end
            current_end = ts
        else:
            # Close current session and start a new one
            sessions.append(
                {
                    "start_ts": current_start,
                    "end_ts": current_end,
                    "duration_seconds": current_end - current_start,
                }
            )
            current_start = ts
            current_end = ts

    # Append last session
    sessions.append(
        {
            "start_ts": current_start,
            "end_ts": current_end,
            "duration_seconds": current_end - current_start,
        }
    )

    return sessions


def compute_idle_metrics_for_day(day: date) -> Dict[str, Any]:
    """
    Compute idle metrics for the given day:
    - maxIdleSeconds: longest period without motion
    - lastEventAgeSeconds: seconds since last event (only for today)
    """
    day_str = day.strftime("%Y-%m-%d")
    rows = get_events_for_day(day_str)
    today = date.today()
    is_today = day == today

    if not rows:
        # No events at all
        if is_today:
            # From midnight until now
            start_ts, end_ts = _get_day_bounds(day, is_today=True)
            max_idle = end_ts - start_ts
            last_age: Optional[int] = None
        else:
            # Full day idle
            max_idle = 24 * 3600
            last_age = None

        return {
            "maxIdleSeconds": max_idle,
            "lastEventAgeSeconds": last_age,
        }

    timestamps = [int(row["timestamp"]) for row in rows]
    timestamps.sort()

    # Bounds of the day
    start_ts, end_ts = _get_day_bounds(day, is_today=is_today)

    # Initialize with gap from start of day to first event
    max_idle = timestamps[0] - start_ts

    # Gaps between events
    for prev, curr in zip(timestamps, timestamps[1:]):
        gap = curr - prev
        if gap > max_idle:
            max_idle = gap

    # Gap from last event to end of day (or now, if today)
    last_event_ts = timestamps[-1]
    end_gap = end_ts - last_event_ts
    if end_gap > max_idle:
        max_idle = end_gap

    # Age since last event (only for today)
    if is_today:
        last_age = int(time.time()) - last_event_ts
    else:
        last_age = None

    return {
        "maxIdleSeconds": max_idle,
        "lastEventAgeSeconds": last_age,
    }


def compute_energy_for_day(day: date) -> Dict[str, Any]:
    """
    Reconstruct LED HIGH time for the given day based on motion events.

    For each event, we assume the LED stays HIGH from [ts, ts + MOTION_WINDOW_SECONDS].
    Overlapping windows are merged before summing.

    Returns:
    - highSecondsToday
    - lowSecondsToday
    - energyUsedWh
    - energySavedPercent (vs always HIGH)
    """
    day_str = day.strftime("%Y-%m-%d")
    rows = get_events_for_day(day_str)
    today = date.today()
    is_today = day == today

    # Day bounds
    start_ts, end_ts = _get_day_bounds(day, is_today=is_today)
    total_window_seconds = max(0, end_ts - start_ts)

    if not rows or total_window_seconds == 0:
        return {
            "highSecondsToday": 0,
            "lowSecondsToday": total_window_seconds,
            "energyUsedWh": 0.0,
            "energySavedPercent": 0.0,
        }

    timestamps = [int(row["timestamp"]) for row in rows]
    timestamps.sort()

    # Build raw intervals [ts, ts + MOTION_WINDOW_SECONDS]
    intervals = []
    for ts in timestamps:
        start = ts
        end = ts + MOTION_WINDOW_SECONDS
        # Clamp interval to day bounds
        if end < start_ts or start > end_ts:
            continue
        start = max(start, start_ts)
        end = min(end, end_ts)
        if start < end:
            intervals.append((start, end))

    if not intervals:
        return {
            "highSecondsToday": 0,
            "lowSecondsToday": total_window_seconds,
            "energyUsedWh": 0.0,
            "energySavedPercent": 0.0,
        }

    # Merge overlapping intervals
    intervals.sort(key=lambda x: x[0])
    merged = []
    curr_start, curr_end = intervals[0]

    for s, e in intervals[1:]:
        if s <= curr_end:
            # Overlap -> extend
            curr_end = max(curr_end, e)
        else:
            merged.append((curr_start, curr_end))
            curr_start, curr_end = s, e
    merged.append((curr_start, curr_end))

    # Sum high seconds
    high_seconds = sum(e - s for s, e in merged)
    high_seconds = min(high_seconds, total_window_seconds)
    low_seconds = max(0, total_window_seconds - high_seconds)

    # Energy estimation
    energy_high_Wh = (high_seconds / 3600.0) * LED_POWER_HIGH_W
    energy_low_Wh = (low_seconds / 3600.0) * LED_POWER_LOW_W
    energy_used_Wh = energy_high_Wh + energy_low_Wh

    # Baseline: always HIGH for the whole period
    energy_always_high_Wh = (total_window_seconds / 3600.0) * LED_POWER_HIGH_W

    if energy_always_high_Wh > 0:
        energy_saved_Wh = energy_always_high_Wh - energy_used_Wh
        energy_saved_percent = max(
            0.0, (energy_saved_Wh / energy_always_high_Wh) * 100.0
        )
    else:
        energy_saved_percent = 0.0

    return {
        "highSecondsToday": int(high_seconds),
        "lowSecondsToday": int(low_seconds),
        "energyUsedWh": round(energy_used_Wh, 4),
        "energySavedPercent": round(energy_saved_percent, 2),
    }


def compute_trends(today: date) -> Dict[str, Any]:
    """
    Compute simple trends:
    - todayCount
    - yesterdayCount
    - weekAverage (last 7 days including today)
    - deltaVsYesterdayPercent
    - deltaVsWeekPercent
    """
    today_str = today.strftime("%Y-%m-%d")
    yesterday = today - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")

    today_count = get_daily_count(today_str)
    yesterday_count = get_daily_count(yesterday_str)

    # Last 7 days (including today)
    week_start = today - timedelta(days=6)
    week_start_str = week_start.strftime("%Y-%m-%d")
    week_counts_map = get_daily_counts_for_range(week_start_str, today_str)

    # Build list of counts in chronological order
    week_counts: List[int] = []
    d = week_start
    while d <= today:
        ds = d.strftime("%Y-%m-%d")
        week_counts.append(week_counts_map.get(ds, 0))
        d += timedelta(days=1)

    if week_counts:
        week_average = sum(week_counts) / len(week_counts)
    else:
        week_average = 0.0

    # Delta vs yesterday
    if yesterday_count > 0:
        delta_vs_yesterday = ((today_count - yesterday_count) / yesterday_count) * 100.0
    else:
        delta_vs_yesterday = None

    # Delta vs week average
    if week_average > 0:
        delta_vs_week = ((today_count - week_average) / week_average) * 100.0
    else:
        delta_vs_week = None

    return {
        "todayCount": today_count,
        "yesterdayCount": yesterday_count,
        "weekAverage": round(week_average, 2),
        "deltaVsYesterdayPercent": (
            round(delta_vs_yesterday, 2) if delta_vs_yesterday is not None else None
        ),
        "deltaVsWeekPercent": (
            round(delta_vs_week, 2) if delta_vs_week is not None else None
        ),
    }


# -----------------------------------------------------------------------------
# Flask application
# -----------------------------------------------------------------------------

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app, resources={r"/api/*": {"origins": "*"}})
swagger = Swagger(app)


@app.route("/")
def index():
    """
    Render the main dashboard page.
    """
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """
    Backend and database health check.
    """
    ok = True
    details: Dict[str, str] = {}

    # Simple DB check
    try:
        _ = get_total_count()
        details["db"] = "ok"
    except Exception as exc:
        logger.exception("Error checking DB in /api/health: %s", exc)
        details["db"] = "error"
        ok = False

    # MQTT check (not tracked yet, so we only report 'unknown')
    details["mqtt"] = "unknown"

    return jsonify({"status": "ok" if ok else "error", "details": details})


@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    """
    Main system metrics.
    """
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")

    metrics: Dict[str, Any] = {}

    try:
        # Total detections (all time)
        total_all_time = get_total_count()
        metrics["totalDetections"] = total_all_time

        # Last 7 days: [today, yesterday, ...]
        detections_by_day: List[int] = []
        for i in range(7):
            day_i = today - timedelta(days=i)
            day_str = day_i.strftime("%Y-%m-%d")
            detections_by_day.append(get_daily_count(day_str))
        metrics["detectionsByDay"] = detections_by_day

        # Today count
        activities_today = detections_by_day[0]
        metrics["activitiesToday"] = activities_today

        # Hourly distribution and peak hour (today)
        hourly_distribution = get_hourly_distribution(today_str)
        metrics["hourlyDistribution"] = hourly_distribution

        peak_hour = get_peak_hour(today_str)
        if peak_hour is not None:
            metrics["peakHours"] = f"{peak_hour:02d}h-{(peak_hour + 1) % 24:02d}h"
        else:
            metrics["peakHours"] = "N/A"

        # Sessions today
        sessions = build_sessions_for_day(today)
        if sessions:
            durations = [s["duration_seconds"] for s in sessions]
            count_sessions = len(sessions)
            avg_duration = sum(durations) / count_sessions
            max_duration = max(durations)
        else:
            count_sessions = 0
            avg_duration = 0
            max_duration = 0

        metrics["sessionsToday"] = {
            "count": count_sessions,
            "averageDurationSeconds": int(round(avg_duration)),
            "maxDurationSeconds": int(max_duration),
        }

        # Idle metrics
        idle = compute_idle_metrics_for_day(today)
        metrics["idleMetrics"] = idle

        # Energy metrics
        energy = compute_energy_for_day(today)
        metrics["energyMetrics"] = energy

        # Trends
        trends = compute_trends(today)
        metrics["trends"] = trends

    except Exception as exc:  # safety net
        logger.exception("Error while computing metrics from database: %s", exc)
        # Minimal fallback
        metrics = {
            "totalDetections": 0,
            "activitiesToday": 0,
            "detectionsByDay": [0] * 7,
            "peakHours": "N/A",
            "hourlyDistribution": {},
            "sessionsToday": {
                "count": 0,
                "averageDurationSeconds": 0,
                "maxDurationSeconds": 0,
            },
            "idleMetrics": {
                "maxIdleSeconds": 0,
                "lastEventAgeSeconds": None,
            },
            "energyMetrics": {
                "highSecondsToday": 0,
                "lowSecondsToday": 0,
                "energyUsedWh": 0.0,
                "energySavedPercent": 0.0,
            },
            "trends": {
                "todayCount": 0,
                "yesterdayCount": 0,
                "weekAverage": 0.0,
                "deltaVsYesterdayPercent": None,
                "deltaVsWeekPercent": None,
            },
        }

    return jsonify(metrics)


@app.route("/api/events", methods=["GET"])
def list_events():
    """
    List recent motion events as JSON.
    """
    try:
        limit_str = request.args.get("limit", "10")
        limit = int(limit_str)

        rows = get_events(limit=limit)
        events: List[Dict[str, Any]] = []

        for row in rows:
            ts = int(row["timestamp"])
            dt_iso = datetime.fromtimestamp(ts).isoformat()
            events.append(
                {
                    "id": row["id"],
                    "timestamp": ts,
                    "datetimeIso": dt_iso,
                    "hour": row["hour"],
                    "day": row["day"],
                }
            )

        return jsonify(events)

    except Exception as exc:
        logger.exception("Error listing events: %s", exc)
        return jsonify({"error": "Failed to list events"}), 500


@app.route("/api/events/export", methods=["GET"])
def export_events_csv():
    """
    Export motion events as CSV.
    """
    try:
        limit_str = request.args.get("limit", "1000")
        limit = int(limit_str)
        rows = get_events(limit=limit)

        def generate():
            yield "id,timestamp,datetime_iso,hour,day\n"
            for row in rows:
                ts = int(row["timestamp"])
                dt_iso = datetime.fromtimestamp(ts).isoformat()
                line = f'{row["id"]},{ts},{dt_iso},{row["hour"]},{row["day"]}\n'
                yield line

        return Response(
            generate(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=motion_events.csv"},
        )

    except Exception as exc:
        logger.exception("Error exporting events CSV: %s", exc)
        return jsonify({"error": "Failed to export CSV"}), 500


# -----------------------------------------------------------------------------
# Application entry point
# -----------------------------------------------------------------------------


def run_mqtt_in_background():
    """
    Start the MQTT client in a daemon thread so Flask can run in parallel.
    """
    thread = threading.Thread(target=start_mqtt_client, daemon=True)
    thread.start()
    return thread


if __name__ == "__main__":
    init_db()

    # Avoid double-start of MQTT when using Flask debug reloader
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        run_mqtt_in_background()

    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "5050"))

    logger.info("Starting Flask app on %s:%s ...", host, port)
    app.run(host=host, port=port, debug=True)
