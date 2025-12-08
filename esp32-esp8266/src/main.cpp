#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "time.h"

#include "env.h"

// ==================== HARDWARE CONFIG ====================

static const int PIN_PIR = 27;
static const int PIN_LED = 4;

static const int LEDC_CHANNEL    = 0;
static const int LEDC_FREQUENCY  = 5000;
static const int LEDC_RESOLUTION = 8;

static const uint8_t BRIGHT_HIGH = 255;
static const uint8_t BRIGHT_LOW  = 60;

static const unsigned long MOTION_WINDOW_MS = 3000;

// ==================== SYSTEM STATE ====================

volatile bool          pirPreviousState = false;
volatile unsigned long lastMotionMillis = 0;

// Local counter only for debug (not used for analytics)
unsigned long motionCountLocal = 0;

WiFiClient   espClient;
PubSubClient mqttClient(espClient);

TaskHandle_t taskSensorsHandle = nullptr;

// ==================== LED CONTROL (PWM) ====================

void applyLedBrightness(uint8_t brightness) {
    ledcWrite(LEDC_CHANNEL, brightness);
}

void updateLedBrightness() {
    unsigned long now = millis();

    if (now - lastMotionMillis <= MOTION_WINDOW_MS) {
        // Recent motion: LED at high brightness
        applyLedBrightness(BRIGHT_HIGH);
    } else {
        // No recent motion: LED at low brightness (energy saving)
        applyLedBrightness(BRIGHT_LOW);
    }
}

// ==================== WIFI ====================

void connectWiFi() {
    Serial.println("[WiFi] Connecting...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long startAttempt = millis();

    // Try to connect for up to 15 seconds
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt) < 15000) {
        Serial.print(".");
        delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected.");
        Serial.print("[WiFi] IP: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println(
            "\n[WiFi] FAILED to connect. Check SSID/password and ensure 2.4 GHz network."
        );
    }
}

// ==================== MQTT CALLBACK ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String message;
    message.reserve(length);

    for (unsigned int i = 0; i < length; i++) {
        message += static_cast<char>(payload[i]);
    }

    Serial.print("[MQTT] Received on ");
    Serial.print(topic);
    Serial.print(": ");
    Serial.println(message);

    // If in the future you want to handle commands:
    // if (String(topic) == TOPIC_COMMANDS) { ... }
}

// ==================== MQTT CONNECTION ====================

void connectMQTT() {
    while (!mqttClient.connected()) {
        Serial.print("[MQTT] Connecting to broker ");
        Serial.print(MQTT_SERVER_ADDR);
        Serial.print(":");
        Serial.print(MQTT_SERVER_PORT);
        Serial.println(" ...");

        String clientId = "lumosMQTT-esp32-";
        clientId += String(random(0xFFFF), HEX);

        // CloudAMQP/LavinMQ: needs user and password
        // if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
        // Local (Mosquitto)    
        if (mqttClient.connect(clientId.c_str())) {
            Serial.println("[MQTT] Connected.");
            mqttClient.subscribe(TOPIC_COMMANDS);
            mqttClient.publish(TOPIC_STATUS, "online", true);
        } else {
            Serial.print("[MQTT] Failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(" — retrying in 2 seconds");
            delay(2000);
        }
    }
}

// ==================== JSON BUILDERS ====================

// Motion event JSON: { "timestamp": 1732708465 }
String buildMotionEventJson(unsigned long timestampSeconds) {
    String json;
    json.reserve(32);

    json += "{";
    json += "\"timestamp\":";
    json += timestampSeconds;
    json += "}";

    return json;
}

// ==================== PUBLISH HELPERS ====================

void publishMotionEvent(unsigned long timestampSeconds) {
    if (!mqttClient.connected()) {
        connectMQTT();
    }

    String payload = buildMotionEventJson(timestampSeconds);
    Serial.print("[MQTT] Publishing motion event to ");
    Serial.print(TOPIC_MOTION);
    Serial.print(": ");
    Serial.println(payload);

    mqttClient.publish(TOPIC_MOTION, payload.c_str(), false);
}

// ==================== SENSOR LOGIC ====================

void handleMotionAndLed() {
    int           pirValue = digitalRead(PIN_PIR);
    unsigned long nowMs    = millis();

    bool motionNow = (pirValue == HIGH);

    if (motionNow) {
        // Rising edge: only count new motion when changing from LOW -> HIGH
        if (!pirPreviousState) {
            motionCountLocal++;

            Serial.print("[SENSOR] Motion detected. Local count: ");
            Serial.println(motionCountLocal);

            // Use NTP if available, otherwise millis() as fallback
            time_t now = time(nullptr);
            unsigned long timestampSeconds;

            if (now < 100000) {
                // NTP did NOT sync -> use time since boot
                timestampSeconds = millis() / 1000;
            } else {
                // NTP OK -> use real epoch time
                timestampSeconds = static_cast<unsigned long>(now);
            }

            publishMotionEvent(timestampSeconds);
        }

        lastMotionMillis = nowMs;
    }

    pirPreviousState = motionNow;

    updateLedBrightness();
}

// ==================== FREERTOS TASKS ====================

void taskSensors(void* pvParameters) {
    (void)pvParameters;

    for (;;) {
        handleMotionAndLed();
        vTaskDelay(pdMS_TO_TICKS(300));
    }
}

// ==================== SETUP / LOOP ====================

void setup() {
    Serial.begin(115200);
    delay(600);

    pinMode(PIN_PIR, INPUT);
    pinMode(PIN_LED, OUTPUT);

    ledcSetup(LEDC_CHANNEL, LEDC_FREQUENCY, LEDC_RESOLUTION);
    ledcAttachPin(PIN_LED, LEDC_CHANNEL);
    applyLedBrightness(BRIGHT_LOW);

    connectWiFi();

    // ==================== NTP SETUP ====================

    Serial.println("[TIME] Syncing with NTP...");
    configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");

    // Wait for sync, but with a 10-second timeout
    unsigned long ntpStart = millis();
    while (time(nullptr) < 100000 && (millis() - ntpStart) < 10000) {
        Serial.print(".");
        delay(500);
    }

    time_t nowNtp = time(nullptr);
    if (nowNtp < 100000) {
        Serial.println("\n[TIME] NTP sync FAILED. Using millis() as fallback.");
    } else {
        Serial.println("\n[TIME] NTP time synchronized!");
    }

    mqttClient.setServer(MQTT_SERVER_ADDR, MQTT_SERVER_PORT);
    mqttClient.setCallback(mqttCallback);
    connectMQTT();

    Serial.println("System initialized. Waiting ~20s for PIR stabilization...");
    delay(20000);
    Serial.println("PIR ready!");

    xTaskCreate(taskSensors, "TaskSensors", 4096, nullptr, 1, &taskSensorsHandle);
}

void loop() {
    if (!mqttClient.connected()) {
        connectMQTT();
    }
    mqttClient.loop();
}
