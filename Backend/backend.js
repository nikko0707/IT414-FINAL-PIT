/*
 * BACKEND SERVER (v6) - The COMPLETE Server
 * NEW: 10-minute global inactivity timer.
 * (Resets on ANY scan)
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
const MQTT_BROKER = 'mqtt://10.71.207.215'; // Your IP Address
const MQTT_TOPIC_SCAN = 'RFID_SCAN';
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN';
const WEB_SERVER_PORT = 3001; // Your React app will talk to this port

// +++++ NEW: 10-minute auto-lock timer +++++
const AUTO_LOCK_DELAY_MS = 10 * 60 * 1000; // 10 minutes
let globalInactivityTimer = null;
// +++++++++++++++++++++++++++++++++++++++

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

// --- Database Connection ---
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

// +++++ NEW: Timer Functions +++++
function setAllCardsInactive() {
  console.log(`10 minutes of inactivity. Setting all cards to 0.`);
  db.query("UPDATE rfid_reg SET rfid_status = 0");
  // The frontend's 5-second poll will pick up this change
  globalInactivityTimer = null; // Timer has fired
}

function resetInactivityTimer() {
  // Clear the old timer
  if (globalInactivityTimer) {
    clearTimeout(globalInactivityTimer);
  }
  // Start a new 10-minute timer
  console.log("Activity detected, resetting 10-minute inactivity timer...");
  globalInactivityTimer = setTimeout(setAllCardsInactive, AUTO_LOCK_DELAY_MS);
}
// ++++++++++++++++++++++++++++++++

// --- MQTT Logic ---
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC_SCAN, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${MQTT_TOPIC_SCAN}`);
      // Start the inactivity timer when we first connect
      resetInactivityTimer();
    }
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    // +++++ NEW: Reset the timer on EVERY scan +++++
    resetInactivityTimer();
    // ++++++++++++++++++++++++++++++++++++++++++++++

    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    processRfidData(rfid_data); // Run your logic
  }
});

// --- Main Database Logic (Requirement 2, 3, 4) ---
function processRfidData(rfid_data) {
  const sql_check_reg = "SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?";

  db.query(sql_check_reg, [rfid_data], (err, results) => {
    if (err) {
      console.error('DB query error (check_reg):', err);
      publishResult('0');
      return;
    }

    // DEFAULT publish value
    let signal_to_publish = '0';

    // ----- CASE 1: RFID IS ALREADY REGISTERED -----
    if (results && results.length > 0) {
      const current_status = results[0].rfid_status;
      const new_status = (current_status == 1) ? 0 : 1;
      signal_to_publish = (new_status == 1) ? '1' : '0';

      db.query(
        "UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?",
        [new_status, rfid_data],
        (updErr) => {
          if (updErr) {
            console.error('DB update error:', updErr);
            publishResult('0');
            return;
          }

          // Log the scan (Requirement 3)
          logScan(rfid_data, new_status, (newLog) => {
            if (newLog) io.emit('new_log', newLog);
          });

          io.emit('status_update', { rfid: rfid_data, status: new_status });
          console.log(`RFID ${rfid_data} found. Toggling to ${new_status}. Publishing: ${signal_to_publish}`);

          publishResult(signal_to_publish);
        }
      );

      return; // end CASE 1
    }

    // ----- CASE 2: RFID NOT FOUND -----
    db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (cntErr, count_results) => {
      if (cntErr) {
        console.error('DB query error (count):', cntErr);
        publishResult('0');
        return;
      }

      const reg_count = (count_results && count_results[0]) ? count_results[0].reg_count : 0;

      // 2a. Auto-register if < 3
      if (reg_count < 3) {
        const new_status = 1; // Register as Active

        db.query(
          "INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, ?)",
          [rfid_data, new_status],
          (insErr, insertResult) => {
            if (insErr) {
              console.error("Insert error:", insErr);
              publishResult('0');
              return;
            }

            // Log the scan (Requirement 3)
            logScan(rfid_data, new_status, (newLog) => {
              if (newLog) io.emit('new_log', newLog);
            });

            // Confirm the inserted row (AFTER insert completes)
            db.query(
              "SELECT * FROM rfid_reg WHERE rfid_data = ?",
              [rfid_data],
              (selErr, rows) => {
                if (selErr) {
                  console.error("DB SELECT error after insert:", selErr);
                  // We'll still publish 1 because insert succeeded
                } else if (rows && rows[0]) {
                  io.emit('new_status_item', rows[0]);
                } else {
                  console.error("No rows returned after insert for:", rfid_data);
                }

                io.emit('status_update', { rfid: rfid_data, status: new_status });

                const signal_to_publish = '1';
                console.log(`RFID ${rfid_data} NOT FOUND. Auto-registering (card ${reg_count + 1} of 3). Publishing: ${signal_to_publish}`);

                publishResult(signal_to_publish);
              }
            );
          }
        );

        return; // end 2a
      }

      // 2b. Max reached: just log as NOT FOUND (status=2) and publish 0
      logScan(rfid_data, 2, (newLog) => {
        if (newLog) io.emit('new_log', newLog);
      });

      const signal_to_publish = '0';
      console.log(`RFID ${rfid_data} NOT FOUND. Max (3) IDs registered. Publishing: ${signal_to_publish}`);
      publishResult(signal_to_publish);
    });
  });
}

// Helper to log scans (hardened)
function logScan(rfid_data, status, callback) {
  const sql_log = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql_log, [rfid_data, status], (err, result) => {
    if (err) {
      console.error('Log insert error:', err);
      if (callback) callback(null);
      return;
    }
        db.query(
      "SELECT * FROM rfid_logs ORDER BY time_log DESC LIMIT 1",
      (err, rows) => {
        if (callback && rows && rows[0]) callback(rows[0]);
      }
    );

  });
}


// Helper to publish
function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
}

// --- API FOR REACT ---

// API Endpoint 1: Gets all registered cards
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ", (err, results) => {
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

// +++++ API Endpoint 3: REMOVED +++++
// We no longer need the /api/toggle endpoint because
// the button is not clickable.

// --- Start the server ---
server.listen(WEB_SERVER_PORT, () => {
  console.log(`Web server listening on http://localhost:${WEB_SERVER_PORT}`);
});