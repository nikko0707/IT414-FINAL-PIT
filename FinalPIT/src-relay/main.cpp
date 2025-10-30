/*
 * RELAY CONTROLLER CODE (ESP32-B)
 * This code connects to WiFi and subscribes to the 'RFID_LOGIN'
 * topic. It controls a relay connected to an LED.
 */

#include <Arduino.h>
#include <Wifi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>

// --- Hardware Pins ---
// The pin connected to your relay's 'IN' pin [cite: 58]
#define RELAY_PIN 23 // <-- IMPORTANT: Change this if you use a different pin

// --- Network Config ---
const char* mqtt_server = "YOUR_MQTT_BROKER_IP"; // <-- IMPORTANT: Set this
const char* mqtt_topic_login = "RFID_LOGIN";     // <-- Topic to listen to [cite: 49]

// --- Instances ---
WiFiMulti wifiMulti;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- This function runs when an MQTT message arrives ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived on topic: ");
  Serial.print(topic);
  Serial.print(". Message: ");
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Control the relay
  if (message == "1") {
    Serial.println("Setting relay PIN HIGH (LED ON)");
    digitalWrite(RELAY_PIN, HIGH); // [cite: 65]
  } else if (message == "0") {
    Serial.println("Setting relay PIN LOW (LED OFF)");
    digitalWrite(RELAY_PIN, LOW); // [cite: 66]
  }
}

// --- WiFi Setup ---
void setupWiFi() {
  wifiMulti.addAP("MORPHEUS", "KirbyEstandarte4724");
  // Add any other WiFi networks here

  Serial.println("Connecting to WiFi...");
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.println("IP Address: " + WiFi.localIP().toString());
}

// --- MQTT Reconnect ---
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (mqttClient.connect("ESP32_Relay_Client")) { // Unique ID
      Serial.println("connected");
      // Subscribe to the correct topic
      mqttClient.subscribe(mqtt_topic_login);
      Serial.println("Subscribed to topic: " + String(mqtt_topic_login));
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// --- Main Setup ---
void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Start with relay OFF

  setupWiFi();
  mqttClient.setServer(mqtt_server, 1883);
  mqttClient.setCallback(mqttCallback); // Set the function to run on new messages
}

// --- Main Loop ---
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop(); // This handles all MQTT communication
}