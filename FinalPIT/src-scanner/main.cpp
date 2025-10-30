/*
 * MODIFIED SCANNER CODE (ESP32-A)
 * This code reads an RFID card and publishes its UID to the
 * 'RFID_SCAN' topic. It REPLACES your http-based 'main.cpp'.
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wifi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h> // <-- Library for MQTT

// --- Hardware Pins ---
#define SS_PIN 5     // Slave Select (SS) pin
#define RST_PIN 0    // Reset (RST) pin

// --- Network Config ---
const char* mqtt_server = "YOUR_MQTT_BROKER_IP"; // <-- IMPORTANT: Set this
const char* mqtt_topic_scan = "RFID_SCAN";         // <-- Topic to send scans to

// --- Instances ---
MFRC522 rfid(SS_PIN, RST_PIN);
WiFiMulti wifiMulti;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- WiFi Setup ---
void setupWiFi() {
  wifiMulti.addAP("MORPHEUS", "KirbyEstandarte4724");
  // Add any other WiFi networks here
  // wifiMulti.addAP("STUDENT_CONNECT", "IloveUSTP!");

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
    if (mqttClient.connect("ESP32_Scanner_Client")) { // Unique ID
      Serial.println("connected");
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
  SPI.begin(18, 19, 23); // Your SPI pins
  rfid.PCD_Init();

  setupWiFi();
  mqttClient.setServer(mqtt_server, 1883);

  Serial.println("Scanner ready. Waiting for an RFID card.");
}

// --- Main Loop ---
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Look for new card
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  Serial.print("Card detected! UID: ");
  String rfidData = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    rfidData += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
    rfidData += String(rfid.uid.uidByte[i], HEX);
  }
  rfidData.toUpperCase();
  Serial.println(rfidData);

  // Publish the UID to the MQTT topic
  Serial.print("Publishing to topic 'RFID_SCAN': ");
  Serial.println(rfidData);
  mqttClient.publish(mqtt_topic_scan, rfidData.c_str());

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(2000); // Wait 2 seconds before next scan
}