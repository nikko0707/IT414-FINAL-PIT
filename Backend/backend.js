const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const mysql = require('mysql');

// --- CONFIGURATION ---
const MQTT_BROKER = 'mqtt://10.71.207.215'; // Your IP
const MQTT_TOPIC_SCAN = 'RFID_SCAN';   // Scanner sends here
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN'; // Backend sends 1/0 here for Relay
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
const io = new Server(server, {
  cors: { origin: "*" }
});

// --- DATABASE ---
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

// --- MQTT LOGIC ---
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

// --- MAIN PROCESS LOGIC ---
function processRfidData(rfid_data) {
  // Step 1: Check if registered
  db.query("SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?", [rfid_data], (err, results) => {
    if (err) return console.error('DB Error:', err);

    let signal = '0';

    // CASE A: REGISTERED CARD
    if (results && results.length > 0) {
      const current = results[0].rfid_status;
      const next_status = (current == 1) ? 0 : 1; // Toggle
      signal = (next_status == 1) ? '1' : '0';

      // Update Status
      db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", [next_status, rfid_data]);
      
      // Log as 1 or 0
      logScan(rfid_data, next_status, (newLog) => io.emit('new_log', newLog));
      
      // Update Frontend List
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

            // Log as 1
            logScan(rfid_data, new_status, (newLog) => io.emit('new_log', newLog));
            
            // Send new card to Frontend
            const newItem = { id: res.insertId, rfid_data: rfid_data, rfid_status: new_status };
            io.emit('new_status_item', newItem);

            signal = '1';
            console.log(`Auto-registered ${rfid_data}. MQTT: ${signal}`);
            publishResult(signal);
          });

        } else {
          // Max limit reached. 
          // Log as 0. (Frontend will see it's not in the list and call it "Not Found")
          logScan(rfid_data, 0, (newLog) => io.emit('new_log', newLog));
          
          signal = '0';
          console.log(`Not Found ${rfid_data}. Max limit. MQTT: ${signal}`);
          publishResult(signal);
        }
      });
    }
  });
}

// Helper to log scans (Crash-Proof Version)
function logScan(rfid_data, status, callback) {
  const sql = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql, [rfid_data, status], (err, result) => {
    if (err) return console.error('Log Error:', err);
    
    // Manual object creation to avoid "Unknown column id" crash
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

// --- API ---
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ORDER BY id ASC", (err, resDb) => {
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

server.listen(WEB_SERVER_PORT, () => {
  console.log(`Backend running on http://localhost:${WEB_SERVER_PORT}`);
});