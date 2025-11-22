/*
 * MOBILE BACKEND SERVER (v10 - Strict Match to Backend.js)
 * 1. Registers max 3 IDs.
 * 2. Logs every scan.
 * 3. NO Inactivity Timer.
 * 4. MQTTX receives '1' or '0' ONLY.
 * 5. "Not Found" is logged as 0.
 */

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const mysql = require('mysql');

// --- CONFIGURATION ---
// IMPORTANT: For mobile testing, ensure this IP is reachable from your phone!
const MQTT_BROKER = 'mqtt://10.71.161.98'; // Broker IP
const MQTT_TOPIC_SCAN = 'RFID_SCAN';
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN';
const WEB_SERVER_PORT = 3001; // Port 3001

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
// Allow connection from any origin (important for mobile)
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
  mqttClient.subscribe(MQTT_TOPIC_SCAN, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${MQTT_TOPIC_SCAN}`);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    processRfidData(rfid_data);
  }
});

// --- MAIN LOGIC (Identical to backend.js) ---
function processRfidData(rfid_data) {
  // Step 1: Check if the card is registered
  const sql_check_reg = "SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?";

  db.query(sql_check_reg, [rfid_data], (err, results) => {
    if (err) return console.error('DB Error:', err);

    let signal_to_publish = '0'; // Default safe state

    // CASE 1: REGISTERED CARD SCANNED
    if (results && results.length > 0) {
      const current_status = results[0].rfid_status;
      // Toggle: If 1 -> 0, If 0 -> 1
      const new_status = (current_status == 1) ? 0 : 1;
      signal_to_publish = (new_status == 1) ? '1' : '0';

      // Update DB Status
      db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", [new_status, rfid_data]);
      
      // Log the scan (Status 0 or 1)
      logScan(rfid_data, new_status, (newLog) => io.emit('new_log', newLog));
      
      // Update Mobile App Status List
      io.emit('status_update', { rfid: rfid_data, status: new_status });
      
      console.log(`Registered ID ${rfid_data}. Toggling to ${new_status}. Sending MQTT: ${signal_to_publish}`);
      publishResult(signal_to_publish);
    
    } else {
      // CASE 2: UNREGISTERED CARD SCANNED
      // Check if we can auto-register (max 3)
      db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (err, count_results) => {
        if (err) return console.error('DB Error:', err);
        const reg_count = count_results[0].reg_count;

        if (reg_count < 3) {
          // SUB-CASE 2A: Register New Card (Active)
          const new_status = 1;
          
          db.query("INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, ?)", [rfid_data, new_status], (err, res) => {
            if (err) return console.error("Insert Error:", err);

            // Log the scan (Status 1)
            logScan(rfid_data, new_status, (newLog) => io.emit('new_log', newLog));
            
            // Send new registered item to mobile app
            const newItem = { id: res.insertId, rfid_data: rfid_data, rfid_status: new_status };
            io.emit('new_status_item', newItem);

            signal_to_publish = '1';
            console.log(`Auto-registering ${rfid_data}. Sending MQTT: ${signal_to_publish}`);
            publishResult(signal_to_publish);
          });

        } else {
          // SUB-CASE 2B: Max Limit Reached -> Log as 0 (Fail)
          // Mobile app will check 'statusList' to know it's "Not Found"
          logScan(rfid_data, 0, (newLog) => io.emit('new_log', newLog));
          
          signal_to_publish = '0'; 
          console.log(`Unknown ID ${rfid_data}. Max registered. Sending MQTT: ${signal_to_publish}`);
          publishResult(signal_to_publish);
        }
      });
    }
  });
}

// --- HELPERS ---
function logScan(rfid_data, status, callback) {
  const sql_log = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql_log, [rfid_data, status], (err, result) => {
    if (err) return console.error('Log Error:', err);
    
    // Construct the log object manually to avoid extra DB query crash
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
  if (signal !== null) {
    mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
  }
}

// --- API ENDPOINTS ---
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ORDER BY id ASC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/logs', (req, res) => {
  db.query("SELECT * FROM rfid_logs ORDER BY time_log DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// --- START ---
// Binds to 0.0.0.0 to be accessible from other devices (like your phone)
server.listen(WEB_SERVER_PORT, '0.0.0.0', () => {
  console.log(`Mobile Backend running on http://0.0.0.0:${WEB_SERVER_PORT}`);
});