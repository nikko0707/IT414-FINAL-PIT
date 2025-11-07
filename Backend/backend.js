/*
 * BACKEND SERVER (v3) - The COMPLETE Server
 * This file now does everything:
 * 1. MQTT for ESP32s
 * 2. MySQL for Database
 * 3. Express API for React (to get old logs)
 * 4. Socket.io for React (for real-time updates)
 */

// --- New Imports ---
const http = require('http'); // To create the web server
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors'); // To prevent browser errors

// --- Old Imports ---
const mqtt = require('mqtt');
const mysql = require('mysql');

// --- Configs ---
const MQTT_BROKER = 'mqtt://192.168.1.106'; // Morpheus 10.56.202.215 || Estandarte-Ext 192.168.1.106
const MQTT_TOPIC_SCAN = 'RFID_SCAN';
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN';
const WEB_SERVER_PORT = 3001; // Your React app will talk to this port

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'It414_db_BLOCK30'
};

// --- Create All Servers ---
const app = express();         // Create Express web app
app.use(cors());               // Use CORS
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, { // Attach Socket.io for real-time
  cors: {
    origin: "*", // Allow all connections
  }
});

let db;
const mqttClient = mqtt.connect(MQTT_BROKER);

// --- Database Connection (Same as before) ---
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

// --- MQTT Logic (Same as before) ---
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC_SCAN, (err) => {
    if (!err) console.log(`Subscribed to topic: ${MQTT_TOPIC_SCAN}`);
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    processRfidData(rfid_data); // Run your logic
  }
});

// --- Main Database Logic (MODIFIED to push updates) ---
function processRfidData(rfid_data) {
  const sql_check_reg = "SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?";
  db.query(sql_check_reg, [rfid_data], (err, results) => {
    if (err) return console.error('DB query error:', err);

    let signal_to_publish = '0';
    if (results.length > 0) {
      // --- RFID IS REGISTERED ---
      const current_status = results[0].rfid_status;
      const new_status = (current_status == 1) ? 0 : 1;
      signal_to_publish = (new_status == 1) ? '1' : '0';

      db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", [new_status, rfid_data]);
      logScan(rfid_data, new_status, (newLog) => {
        // *** PUSH UPDATE ***
        // After logging, send the new data to all connected React apps
        io.emit('new_log', newLog); // Send the new log
        io.emit('status_update', { rfid: rfid_data, status: new_status }); // Send the new status
      });
      console.log(`RFID ${rfid_data} found. Toggling to ${new_status}. Publishing: ${signal_to_publish}`);
    } else {
      // --- RFID NOT FOUND ---
      db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (err, count_results) => {
        if (err) return console.error('DB query error:', err);
        const reg_count = count_results[0].reg_count;

        // ++++++++++ THIS IS YOUR NEW LOGIC ++++++++++
        // This will register a card if the count is 0, 1, or 2.
        if (reg_count < 3) { // Your logic to allow 3 IDs
        // ++++++++++++++++++++++++++++++++++++++++++++

          const new_status = 1;
          db.query("INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, ?)", [rfid_data, new_status]);
          logScan(rfid_data, new_status, (newLog) => {
             // *** PUSH UPDATE ***
            io.emit('new_log', newLog);
            // Also push this new card to the status list
            db.query("SELECT * FROM rfid_reg WHERE id = (SELECT MAX(id) FROM rfid_reg)", (err, rows) => {
              if (rows[0]) io.emit('new_status_item', rows[0]);
            });
          });
          signal_to_publish = '1';
          console.log(`RFID ${rfid_data} NOT FOUND. Auto-registering. Publishing: ${signal_to_publish}`);
        } else {
          // Now that 3 cards are registered, log all others as failed
          // +++++ THIS IS YOUR NEW CHANGE +++++
          logScan(rfid_data, 2, (newLog) => io.emit('new_log', newLog)); // Log as status 2 (Not Found)
          // +++++++++++++++++++++++++++++++++++
          signal_to_publish = '0';
          console.log(`RFID ${rfid_data} NOT FOUND. Max (3) IDs registered. Publishing: ${signal_to_publish}`);
        }
        publishResult(signal_to_publish);
      });
      return;
    }
    publishResult(signal_to_publish);
  });
}

// Helper to log scans (MODIFIED with callback)
function logScan(rfid_data, status, callback) {
  const sql_log = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql_log, [rfid_data, status], (err, result) => {
    if (err) return console.error('Log insert error:', err);
    // Get the full log we just inserted
    db.query("SELECT * FROM rfid_logs WHERE id = ?", [result.insertId], (err, rows) => {
        if (callback && rows[0]) callback(rows[0]); // Send the new log back
    });
  });
}

// Helper to publish (Same as before)
function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
}

// --- NEW API FOR REACT ---

// API Endpoint 1: Gets all registered cards
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ORDER BY id", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// API Endpoint 2: Gets all the past logs
app.get('/api/logs', (req, res) => {
  db.query("SELECT * FROM rfid_logs ORDER BY time_log DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// API Endpoint 3: Handles the toggle button from React
app.post('/api/toggle/:rfid', (req, res) => {
  const rfid_data = req.params.rfid;
  // We re-use the *same* logic as a physical scan
  processRfidData(rfid_data);
  res.json({ message: 'Toggle request received' });
});

// --- NEW: Start the server ---
server.listen(WEB_SERVER_PORT, () => {
  console.log(`Web server listening on http://localhost:${WEB_SERVER_PORT}`);
});