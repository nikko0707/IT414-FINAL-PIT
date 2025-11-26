#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>


WiFiMulti wifiMulti;

const char* mqtt_server = "192.168.1.101";
const char* topic_subscribe = "RFID_LOGIN";


#define RELAY_PIN 21

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastReconnectAttempt = 0;


void callback(char* topic, byte* message, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) {
    msg += (char)message[i];
  }

  msg.trim();

  Serial.print("Received message: ");
  Serial.println(msg);

  if (msg == "1") {
    digitalWrite(RELAY_PIN, HIGH);
    Serial.println("Relay ON");
  } 
  else if (msg == "0") {
    digitalWrite(RELAY_PIN, LOW);
    Serial.println("Relay OFF");
  } 
  else {
    Serial.println("Message ignored");
  }
}


void setupWiFi() {
  // Add all access points you want:
  wifiMulti.addAP("Estandarte-Ext", "12345678910");
  //wifiMulti.addAP("Cloud Control Network", "ccv7network");
  //wifiMulti.addAP("You never know", "123456789");
  //wifiMulti.addAP("MORPHEUS", "KirbyEstandarte4724");

  Serial.println("Connecting to WiFi...");
  while (wifiMulti.run() != WL_CONNECTED) {
    Serial.print(".");
    delay(1000);
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}


void reconnect() {
  if (millis() - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = millis();

  Serial.print("Attempting MQTT connection...");

  if (client.connect("ESP32_RELAY_CLIENT")) {
    Serial.println("connected!");
    client.subscribe(topic_subscribe);
    Serial.print("Subscribed to topic: ");
    Serial.println(topic_subscribe);
  } else {
    Serial.print("failed, rc=");
    Serial.println(client.state());
  }
}


void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);  // Start OFF

  setupWiFi();  

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  lastReconnectAttempt = 0;
}


void loop() {
  // Reconnect WiFi if disconnected
  if (wifiMulti.run() != WL_CONNECTED) {
    Serial.println("WiFi lost... reconnecting...");
  }

  // Reconnect MQTT if disconnected
  if (!client.connected()) {
    reconnect();
  } else {
    client.loop();
  }
}
