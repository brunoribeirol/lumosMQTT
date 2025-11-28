
# lumosMQTT – Smart Presence-Based Lighting with ESP32, MQTT and Flask

> Embedded Systems Project – CESAR School  
> Professors: Bella Nunes • Jymmy Barreto  

lumosMQTT is an IoT system that monitors room occupancy using an ESP32 and a PIR motion sensor, controls the lighting based on presence, and sends all events to a Raspberry Pi via MQTT.  
On the Raspberry Pi, a Python + Flask backend stores the events in SQLite and exposes a real-time dashboard and analytics API.

The goal is to reduce energy consumption in indoor environments (classrooms, labs, offices) through presence-based lighting with data-driven insights.

---

## 1. Objectives

- Use **ESP32** as a smart sensor/actuator node (presence + LED control).
- Use **Wi‑Fi + MQTT** to send motion events to a central server (Raspberry Pi).
- Provide a **web dashboard** with real-time metrics and historical analysis.
- Persist all events in a **relational database (SQLite)** for analytics.
- Demonstrate **energy savings** and **usage patterns** based on presence data.

---

## 2. System Overview

High-level architecture:

```text
[ PIR Sensor ]        [ LED ]
      │                 ▲
      │                 │ PWM (brightness)
      ▼                 │
   [ ESP32 ] -- Wi‑Fi --> [ MQTT Broker (Mosquitto) ] <---> [ Flask Backend ]
                                                │
                                                ▼
                                         [ SQLite (motion.db) ]
                                                │
                                                ▼
                                        [ Web Dashboard (HTML/JS) ]
```

Main data flow:

1. The ESP32 reads the PIR sensor (GPIO 27) and controls the LED brightness (GPIO 4 via PWM) using a motion window of 3 seconds.
2. On each **new motion detection**, the ESP32:
   - Updates the LED to high brightness for a short period.
   - Builds a JSON payload `{"timestamp": <epoch_seconds>}` (NTP-synchronized when available).
   - Publishes the message to the MQTT topic `lumosMQTT/motion`.
3. The **Raspberry Pi** (or any server) runs Mosquitto (MQTT broker) and the Flask backend:
   - Subscribes to `lumosMQTT/motion`.
   - Stores each event in `motion.db` (table `motion_events`).
   - Computes metrics (daily counts, sessions, idle time, energy estimates, etc.).
   - Exposes the dashboard (`/`) and a JSON API (`/api/metrics`).

---

## 3. Features

### 3.1 ESP32 Firmware

- Motion detection with **PIR sensor** on `PIN_PIR = 27`.
- **Adaptive LED brightness** on `PIN_LED = 4` using PWM (`ledcWrite`):
  - High brightness when motion was detected in the last `MOTION_WINDOW_MS = 3000` ms.
  - Low brightness for energy saving when idle.
- Wi‑Fi station mode with credentials injected via **compile-time macros** (`WIFI_SSID`, `WIFI_PASSWORD`).
- Time synchronization via **NTP** with graceful fallback to `millis()` if NTP fails.
- MQTT client (PubSubClient) with:
  - Connection and reconnection logic.
  - Publishing of motion events as compact JSON.
  - Subscription to a command topic (prepared for future expansions).

### 3.2 Backend & Dashboard

- **Flask** application exposing:
  - `GET /` – main HTML dashboard (real-time visualization).
  - `GET /api/metrics` – JSON API with all computed metrics.
- **SQLite** database (`motion.db`) to persist all events with:
  - `timestamp` (Unix seconds), `hour` (0–23), `day` (`YYYY-MM-DD`).
- Analytics computed from the database:
  - `totalDetections` – total number of motion events (all time).
  - `activitiesToday` – number of events today.
  - `detectionsByDay` – last 7 days, from today backwards.
  - `hourlyDistribution` – number of events per hour for today.
  - `peakHours` – hour range with the highest activity today (e.g. `19h-20h`).
  - **Sessions**:
    - `sessionsToday.count`
    - `sessionsToday.averageDurationSeconds`
    - `sessionsToday.maxDurationSeconds`
  - **Idle metrics**:
    - `idleMetrics.maxIdleSeconds` – longest interval without motion today.
    - `idleMetrics.lastEventAgeSeconds` – time since the last event (for today).
  - **Energy metrics** (estimated from LED high/low periods):
    - `energyMetrics.highSecondsToday`
    - `energyMetrics.lowSecondsToday`
    - `energyMetrics.energyUsedWh`
    - `energyMetrics.energySavedPercent` (vs. always-high LED).
  - **Trends** (7-day window):
    - `trends.todayCount`
    - `trends.yesterdayCount`
    - `trends.weekAverage`
    - `trends.deltaVsYesterdayPercent`
    - `trends.deltaVsWeekPercent`.

---

## 4. Architecture & Technologies

### 4.1 Hardware

- 1× ESP32 DevKit (NodeMCU-style).
- 1× PIR motion sensor (e.g., HC‑SR501).
- 1× LED + appropriate resistor.
- Jumper wires and breadboard.
- 1× Raspberry Pi (or any Linux machine) running:
  - Mosquitto (MQTT broker).
  - Python + Flask backend.

### 4.2 Software & Libraries

- **ESP32 firmware**
  - PlatformIO + Arduino framework.
  - `WiFi.h`, `PubSubClient.h`.
  - FreeRTOS tasks (`xTaskCreate`, `vTaskDelay`).

- **Backend & dashboard**
  - Python 3.10+.
  - Flask, Flask‑CORS.
  - paho‑mqtt.
  - SQLite3.

- **MQTT Broker**
  - Mosquitto (IPv4 or IPv6).

---

## 5. Repository Structure

The repository follows the suggested structure for the Embedded Systems project, adapted to this implementation:

```text
.
├── README.md               # Project documentation (this file)
├── docs/                   # Report (ABNT2) + diagrams and screenshots
├── raspberry-pi/           # Flask backend + MQTT client + database utilities
│   ├── app.py              # Flask application + MQTT thread + metrics API
│   ├── database.py         # SQLite access layer (motion_events)
│   ├── templates/
│   │   └── index.html      # Dashboard HTML
│   └── static/             # CSS, JS, charts, assets
├── esp32-esp8266/          # ESP32 firmware (PlatformIO project)
│   ├── src/
│   │   └── main.cpp        # Motion + LED + MQTT + NTP
│   ├── include/
│   │   └── env.h           # Topic macros (MQTT, Wi‑Fi via build_flags)
│   └── platformio.ini      # Board, libraries, Wi‑Fi & MQTT configuration
└── schematics/             # Circuit diagrams (Fritzing/KiCad or similar)
```

> Note: Folder names may be adjusted to match the actual repository layout, but the README is written to follow this logical separation.

---

## 6. ESP32 Firmware

### 6.1 Behavior

- Reads the PIR sensor on `PIN_PIR = 27` periodically in a FreeRTOS task (`taskSensors`).
- Maintains a **motion window** (`MOTION_WINDOW_MS = 3000` ms).  
  If any motion is detected during this window, the LED remains in high brightness.
- Uses PWM on `PIN_LED = 4` with:
  - Channel: `LEDC_CHANNEL = 0`
  - Frequency: `LEDC_FREQUENCY = 5000` Hz
  - Resolution: `LEDC_RESOLUTION = 8` bits
  - `BRIGHT_HIGH = 255`, `BRIGHT_LOW = 60`
- Connects to Wi‑Fi using `WIFI_SSID` and `WIFI_PASSWORD` (provided by `build_flags`).
- Configures NTP time (`configTime`) and waits up to 10 seconds for synchronization.
- On motion **rising edge** (LOW → HIGH):
  - Increments a local motion counter (for serial debug).
  - Builds JSON via `buildMotionEventJson()`:
    ```json
    { "timestamp": 1732708465 }
    ```
    - Uses real NTP time when synchronized.
    - Falls back to `millis()/1000` if NTP is not available.
  - Publishes this JSON to the MQTT topic defined as `TOPIC_MOTION` in `env.h`:
    ```c
    #define TOPIC_STATUS "lumosMQTT/status"
    #define TOPIC_MOTION "lumosMQTT/motion"
    ```
- Maintains MQTT connection in the `loop()` function and automatically reconnects when needed.

### 6.2 Configuration (`platformio.ini`)

Example configuration:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

monitor_speed = 115200

lib_deps =
    knolleary/PubSubClient @ ^2.8

build_flags =
    -DWIFI_SSID="<YourNetworkSSID>"
    -DWIFI_PASSWORD="<YourNetworkPassword>"
    -DMQTT_SERVER_ADDR="<MQTT_BROKER_IP_OR_HOST>"
    -DMQTT_SERVER_PORT=<MQTT_BROKER_PORT>
```

Replace the values with your own Wi‑Fi and MQTT broker settings.

### 6.3 How to Flash the ESP32 (PlatformIO)

1. Install **PlatformIO** (VS Code extension or CLI).
2. Clone this repository and open the `esp32-esp8266/` folder as a PlatformIO project.
3. Adjust `platformio.ini` with your Wi‑Fi and MQTT settings.
4. Connect the ESP32 via USB.
5. Build and upload:

   ```bash
   pio run
   pio run --target upload
   ```

6. Open the serial monitor to confirm Wi‑Fi and MQTT connection:

   ```bash
   pio device monitor
   ```

---

## 7. Backend & Dashboard (Raspberry Pi)

### 7.1 Database Schema

The backend uses a single table `motion_events` in `motion.db`:

```sql
CREATE TABLE IF NOT EXISTS motion_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    hour      INTEGER NOT NULL,
    day       TEXT    NOT NULL
);
```

Each MQTT message from the ESP32 is translated into one row with:

- `timestamp` – Unix seconds when the event was stored on the server.
- `hour` – hour of the event (0–23).
- `day` – string in the format `YYYY-MM-DD`.

### 7.2 MQTT Integration

- The backend uses `paho-mqtt` to connect to the broker.
- On successful connection, it subscribes to the motion topic:

  ```python
  MQTT_TOPIC_MOTION = os.getenv("MQTT_TOPIC_MOTION", "lumosMQTT/motion")
  ```

- For each message received:
  - Tries to parse the payload as JSON and extract `"timestamp"` (device time).
  - Uses **server time** (`time.time()`) as canonical timestamp for the database.
  - Stores the event in `motion_events`.
  - Logs both server timestamp and device timestamp for debugging.

### 7.3 Flask Application

Key endpoints:

#### `GET /`

- Renders `templates/index.html`.
- The dashboard loads metrics from `/api/metrics` periodically via JavaScript.
- Displays cards and charts such as:
  - Total detections.
  - Detections in the last 7 days.
  - Hourly distribution.
  - Energy saved percentage.
  - Peak usage hours.

#### `GET /api/metrics`

- Returns a JSON object with all computed metrics. Example (simplified):

  ```json
  {
    "totalDetections": 92,
    "activitiesToday": 92,
    "detectionsByDay": [92, 0, 0, 0, 0, 0, 0],
    "hourlyDistribution": { "18": 34, "19": 52, "20": 6 },
    "peakHours": "19h-20h",
    "sessionsToday": {
      "count": 14,
      "averageDurationSeconds": 162.64,
      "maxDurationSeconds": 492
    },
    "idleMetrics": {
      "maxIdleSeconds": 67297,
      "lastEventAgeSeconds": 58
    },
    "energyMetrics": {
      "highSecondsToday": 275,
      "lowSecondsToday": 72177,
      "energyUsedWh": 10.2538,
      "energySavedPercent": 83.02
    },
    "trends": {
      "todayCount": 92,
      "yesterdayCount": 0,
      "weekAverage": 13.14,
      "deltaVsYesterdayPercent": null,
      "deltaVsWeekPercent": 600.0
    }
  }
  ```

### 7.4 Environment Variables

The backend supports configuration via environment variables:

- `MQTT_BROKER` – MQTT broker host (default: `"::1"` for IPv6 localhost).
- `MQTT_PORT` – MQTT broker port (default: `1884`).
- `MQTT_TOPIC_MOTION` – MQTT topic for motion events (default: `"lumosMQTT/motion"`).

You can also use an IPv4 configuration, for example:

```bash
export MQTT_BROKER="192.168.15.29"
export MQTT_PORT=1883
```

### 7.5 Running the Backend

Assuming you are in the `raspberry-pi/` folder:

1. Create and activate a virtual environment (recommended):

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Linux/macOS
   # .venv\Scripts\activate  # Windows (PowerShell)
   ```

2. Install dependencies (example):

   ```bash
   pip install -r requirements.txt
   ```

   The `requirements.txt` file should include at least:
   - `Flask`
   - `Flask-Cors`
   - `paho-mqtt`

3. Initialize the database and start the Flask application:

   ```bash
   export MQTT_BROKER="::1"      # or your broker IP
   export MQTT_PORT=1884         # or 1883 for IPv4
   python app.py
   ```

4. Access the dashboard in a browser:

   ```text
   http://<raspberry-pi-ip>:5050/
   ```

   Example on the Pi itself: `http://localhost:5050/`

The MQTT client is started in a **background thread** so that Flask and the broker integration run in parallel.

---

## 8. How to Run the Full System (End-to-End)

1. **Start the MQTT broker (Mosquitto)** on the Raspberry Pi:
   - Configure it to listen on IPv4 and/or IPv6 as needed.
   - Ensure the port matches `MQTT_SERVER_PORT` on the ESP32 and `MQTT_PORT` in the backend.

2. **Start the Flask backend** (`app.py`) with proper environment variables.

3. **Flash and start the ESP32 firmware**:
   - Ensure `WIFI_SSID` and `WIFI_PASSWORD` allow the ESP32 to reach the broker.
   - Ensure `MQTT_SERVER_ADDR` points to the broker’s IP (or hostname).

4. **Open the dashboard** in a browser and move in front of the PIR sensor:
   - You should see the metrics update in near real time.
   - The LED will switch between high and low brightness according to motion.

---

## 9. How This Project Meets the Course Requirements

- **ESP32 as sensor/actuator node**: motion detection and LED control are implemented in the firmware.
- **MQTT communication**: the system uses Mosquitto as broker, with the ESP32 publishing JSON messages and the backend subscribing to the motion topic.
- **Wi‑Fi connectivity**: ESP32 connects to a 2.4 GHz network using credentials set via `build_flags`.
- **Dashboard in real time**: Flask + HTML/JS dashboard visualizes metrics based on live data from the database.
- **Data persistence**: all events are stored in SQLite (`motion.db`), enabling historical analysis and trends.
- **FreeRTOS** usage: the ESP32 firmware uses tasks and delays from FreeRTOS, following the project’s embedded systems context.
- **GitHub organization**: repository structure, README, documentation and code separation are aligned with the course’s expectations.

---

## 10. Future Improvements

Some ideas for next iterations:

- Add **additional sensors** (e.g., ambient light, temperature) to correlate presence with context.
- Integrate **notifications** (e-mail, messaging apps) for after-hours movement.
- Implement **role-based access** on the dashboard (admin vs. viewer).
- Export data to **CSV/JSON** for external analysis (e.g., in Jupyter/BI tools).
- Integrate with **Node-RED** or other visualization tools for more complex flows.
- Add **configuration endpoints** to adjust parameters (motion window, thresholds, etc.) via API.

---

## 11. License

This is an academic project developed for the Embedded Systems course at CESAR School.  
You may reuse and adapt the code for educational purposes, giving proper credit to the authors and the institution.
