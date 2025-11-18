const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mqtt = require("mqtt");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Example REST APIs (keep your current ones)
app.get("/api/status", (req, res) => {
  res.json([
    { id: 1, rfid_data: "ABC123", rfid_status: 1 },
    { id: 2, rfid_data: "XYZ789", rfid_status: 0 },
  ]);
});

app.get("/api/logs", (req, res) => {
  res.json([
    { id: 1, rfid_data: "ABC123", rfid_status: 1, time_log: new Date().toISOString() },
  ]);
});

// MQTT setup
const mqttClient = mqtt.connect("mqtt://localhost:1883"); // Replace with your broker IP if needed

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker ✅");
  mqttClient.subscribe("rfid/scans", (err) => {
    if (!err) console.log("Subscribed to rfid/scans topic ✅");
  });
});

mqttClient.on("message", (topic, message) => {
  const rfidData = message.toString();
  console.log("RFID scan received via MQTT:", rfidData);

  // Emit Socket.IO events to frontend
  io.emit("new_log", { rfid_data: rfidData, rfid_status: 1, time_log: new Date().toISOString() });
  io.emit("status_update", { rfid: rfidData, status: 1 });
});

// Socket.IO connections
io.on("connection", (socket) => {
  console.log("Client connected ✅");
  socket.on("disconnect", () => {
    console.log("Client disconnected ❌");
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
