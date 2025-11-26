
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const mysql = require('mysql');

// --- CONFIGURATION ---
// IMPORTANT: Use your computer's LOCAL IP address here.
// 'localhost' will NOT work for devices connecting from outside.
const MQTT_BROKER = 'mqtt://192.168.1.101'; 
const MQTT_TOPIC_SCAN = 'RFID_SCAN';
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN';
const WEB_SERVER_PORT = 3001;

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'It414_db_BLOCK30'
};

// --- SERVER SETUP ---
const app = express();
app.use(cors());
const server = http.createServer(app);
// Allow connections from any origin (crucial for mobile testing)
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- DATABASE & MQTT SETUP ---
let db;
const mqttClient = mqtt.connect(MQTT_BROKER);

function handleDbConnection() {
  db = mysql.createConnection(DB_CONFIG);
  db.connect(err => {
    if (err) {
      console.error('Error connecting to DB:', err);
      setTimeout(handleDbConnection, 2000);
    } else {
      console.log('Successfully connected to MySQL database.');
    }
  });
  db.on('error', err => {
    console.error('DB error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') handleDbConnection();
    else throw err;
  });
}
handleDbConnection();

// --- MQTT LISTENERS ---
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC_SCAN);
});

mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    processRfidData(rfid_data);
  }
});

// --- MAIN PROCESS LOGIC (Identical to backend.js) ---
function processRfidData(rfid_data) {
  // Step 1: Check if registered
  db.query("SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?", [rfid_data], (err, results) => {
    if (err) return console.error('DB Error:', err);

    let signal = '0';

    // CASE A: REGISTERED CARD
    if (results && results.length > 0) {
      const current = results[0].rfid_status;
      const next_status = (current == 1) ? 0 : 1; 
      signal = (next_status == 1) ? '1' : '0';

      // Update Status
      db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", [next_status, rfid_data]);
      
      // Log scan
      logScan(rfid_data, next_status, (newLog) => io.emit('new_log', newLog));
      
      // Update Status List
      io.emit('status_update', { rfid: rfid_data, status: next_status });
      
      console.log(`Registered ${rfid_data}. Toggling to ${next_status}. MQTT: ${signal}`);
      publishResult(signal);

    } else {
      // CASE B: NOT REGISTERED
      db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (err, count_res) => {
        if (err) return console.error('DB Error:', err);
        const count = count_res[0].reg_count;

        // Can we register? (Limit 3)
        if (count < 3) {
          const new_status = 1;
          
          db.query("INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, ?)", [rfid_data, new_status], (err, res) => {
            if (err) return console.error('Insert Error', err);

            // Log scan
            logScan(rfid_data, new_status, (newLog) => io.emit('new_log', newLog));
            
            // Send new card to client
            const newItem = { id: res.insertId, rfid_data: rfid_data, rfid_status: new_status };
            io.emit('new_status_item', newItem);

            signal = '1';
            console.log(`Auto-registered ${rfid_data}. MQTT: ${signal}`);
            publishResult(signal);
          });

        } else {
          // Max limit reached. Log as 0.
          logScan(rfid_data, 0, (newLog) => io.emit('new_log', newLog));
          
          signal = '0';
          console.log(`Not Found ${rfid_data}. Max limit. MQTT: ${signal}`);
          publishResult(signal);
        }
      });
    }
  });
}

// Helper to log scans (Robust Version)
function logScan(rfid_data, status, callback) {
  const sql = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql, [rfid_data, status], (err, result) => {
    if (err) return console.error('Log Error:', err);
    
    // Build log object manually to avoid "Unknown column id" crash
    const newLog = {
      id: result.insertId || Date.now(),
      rfid_data: rfid_data,
      rfid_status: status,
      time_log: new Date().toISOString()
    };
    if (callback) callback(newLog);
  });
}

function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
}

// --- API ENDPOINTS ---
app.get('/api/status', (req, res) => {
  // Removed ORDER BY id just in case, to match robustness
  db.query("SELECT * FROM rfid_reg", (err, resDb) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(resDb);
  });
});

app.get('/api/logs', (req, res) => {
  db.query("SELECT * FROM rfid_logs ORDER BY time_log DESC", (err, resDb) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(resDb);
  });
});

// --- START SERVER ---
// Listen on 0.0.0.0 so mobile devices on the same WiFi can connect
server.listen(WEB_SERVER_PORT, '0.0.0.0', () => {
  console.log(`Mobile Backend running on http://0.0.0.0:${WEB_SERVER_PORT}`);
});