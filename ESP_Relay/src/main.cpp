#include <WiFi.h>
#include <PubSubClient.h>

// --- WiFi and MQTT settings ---
const char* ssid = "You never know";
const char* password = "123456789";
const char* mqtt_server = "10.71.161.98";
const char* topic_subscribe = "RFID_LOGIN";

// --- Designated pin ---
#define RELAY_PIN 21  // Change this to your pin

WiFiClient espClient;
PubSubClient client(espClient);

// --- Track last reconnect attempt ---
unsigned long lastReconnectAttempt = 0;

// --- MQTT message callback ---
void callback(char* topic, byte* message, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) {
    msg += (char)message[i];
  }

  msg.trim();  // Remove whitespace
  Serial.print("Received message: ");
  Serial.println(msg);

  // Only act on "1" or "0"
  if (msg == "1") {
    digitalWrite(RELAY_PIN, HIGH);  // ON
    Serial.println("Relay ON");
  } 
  else if (msg == "0") {
    digitalWrite(RELAY_PIN, LOW);   // OFF
    Serial.println("Relay OFF");
  } 
  else {
    Serial.println("Message ignored (no action)");
  }
}

void reconnect() {
  // Limit reconnect attempts to every 5 seconds
  if (millis() - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = millis();

  Serial.print("Attempting MQTT connection...");

  if (client.connect("ESP32_RELAY")) {
    Serial.println("connected");
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

  // Initialize pin
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Start OFF

  // Connect to WiFi
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup MQTT
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

void loop() {
  // Reconnect if needed
  if (!client.connected()) {
    reconnect();
  } else {
    client.loop();
  }
}
