/*
 * RELAY CONTROLLER CODE (ESP32-B)
 * This code subscribes to the 'RFID_LOGIN' topic and
 * controls the relay/LED based on "1" or "0" messages.
 */

#include <Arduino.h>
#include <Wifi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h> // Library for MQTT

// --- Hardware Pins ---
// The pin your relay's 'IN' wire is connected to
// This must match your physical wiring [cite: 58]
#define RELAY_PIN 23 // <-- IMPORTANT: Change this if you use a different pin

// --- Network Config ---
// IMPORTANT: Set this to your computer's IP address
const char* mqtt_server = "10.56.202.215"; 
// The topic we LISTEN to for the '1' or '0'
const char* mqtt_topic_login = "RFID_LOGIN";     

// --- Instances ---
WiFiMulti wifiMulti;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- MQTT Callback Function ---
// This function runs automatically every time a message arrives
// on a topic we are subscribed to.
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived on topic: ");
  Serial.print(topic);
  Serial.print(". Message: ");
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // This is the main logic for this device
  // Check if the message is "1" or "0" [cite: 65, 66]
  if (message == "1") {
    Serial.println("Setting relay PIN HIGH (LED ON)");
    digitalWrite(RELAY_PIN, HIGH); // Turn on the LED [cite: 65]
  } else if (message == "0") {
    Serial.println("Setting relay PIN LOW (LED OFF)");
    digitalWrite(RELAY_PIN, LOW); // Turn off the LED [cite: 66]
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
      
      // Tell the broker we want messages from this topic
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
  // Set the relay pin as an output
  pinMode(RELAY_PIN, OUTPUT);
  // Start with the relay (and LED) OFF
  digitalWrite(RELAY_PIN, LOW); 

  setupWiFi(); // Connect to WiFi
  mqttClient.setServer(mqtt_server, 1883); // Tell MQTT who the broker is
  // Tell the client which function to run when a message comes in
  mqttClient.setCallback(mqttCallback); 
}

// --- Main Loop ---
void loop() {
  // Make sure we are connected
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  // This handles all MQTT communication (listening, etc.)
  mqttClient.loop(); 
}