#pragma once

// These macros come from platformio.ini build_flags:
// WIFI_SSID
// WIFI_PASSWORD
// MQTT_SERVER_ADDR
// MQTT_SERVER_PORT

// MQTT topics
#define TOPIC_STATUS   "lumosMQTT/status"
#define TOPIC_MOTION   "lumosMQTT/motion"