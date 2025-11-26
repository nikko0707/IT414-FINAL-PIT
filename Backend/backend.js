const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const mysql = require('mysql');

// --- CONFIGURATION ---
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

// --- SOCKET.IO LISTEN FOR UI TOGGLE ---
io.on("connection", (socket) => {
  console.log("Frontend connected");

  socket.on("toggle_rfid_status", ({ rfid, newStatus }) => {
    console.log(`Toggle from UI: ${rfid} -> ${newStatus}`);

    db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", 
      [newStatus, rfid], 
      (err) => {
        if (err) {
          console.error('Toggle Error:', err);
          return;
        }

        logScan(rfid, newStatus, (newLog) => io.emit('new_log', newLog));
        io.emit("status_update", { rfid, status: newStatus });

        const signal = newStatus === 1 ? '1' : '0';
        publishResult(signal);
      }
    );
  });

  socket.on("disconnect", () => {
    console.log("Frontend disconnected");
  });
});

// --- MAIN SCAN PROCESS ---
function processRfidData(rfid_data) {
  db.query("SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?", 
    [rfid_data], 
    (err, results) => {
      if (err) return console.error('DB Error:', err);

      // ----------------------------
      // CASE 1: RFID is REGISTERED
      // ----------------------------
      if (results && results.length > 0) {
        const current = results[0].rfid_status;
        const next_status = (current == 1) ? 0 : 1;
        const signal = (next_status == 1) ? '1' : '0';

        db.query("UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?", 
          [next_status, rfid_data]
        );

        logScan(rfid_data, next_status, (newLog) => io.emit('new_log', newLog));
        io.emit('status_update', { rfid: rfid_data, status: next_status });

        console.log(`REGISTERED ${rfid_data} → Toggling to ${next_status} → MQTT: ${signal}`);
        publishResult(signal);  // <-- Relay toggles correctly
      } 

      // ----------------------------
      // CASE 2: RFID NOT REGISTERED
      // ----------------------------
      else {

        // Count how many existing records
        db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (err, count_res) => {
          if (err) return console.error('DB Error:', err);
          const count = count_res[0].reg_count;

          // ----------------------------
          // Auto-register up to 3 items
          // ----------------------------
          if (count < 3) {
            const new_status = 1;

            db.query("INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, ?)", 
              [rfid_data, new_status], 
              (err, res) => {
                if (err) return console.error('Insert Error', err);

                logScan(rfid_data, new_status, (newLog) => io.emit('new_log', newLog));

                const newItem = { 
                  id: res.insertId, 
                  rfid_data: rfid_data, 
                  rfid_status: new_status 
                };
                io.emit('new_status_item', newItem);

                console.log(`AUTO-REGISTERED ${rfid_data} → NO MQTT SENT.`);
                // NO publishResult() here
              }
            );
          } 

          // ----------------------------
          // NOT REGISTERED (LIMIT REACHED)
          // Relay SHOULD NOT react
          // ----------------------------
          else {
            logScan(rfid_data, 0, (newLog) => io.emit('new_log', newLog));

            console.log(`NOT REGISTERED ${rfid_data} → LIMIT REACHED → NO MQTT SENT.`);
            // DO NOT send anything to the relay
          }
        });
      }
    }
  );
}

// --- LOGGING ---
function logScan(rfid_data, status, callback) {
  const sql = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql, [rfid_data, status], (err, result) => {
    if (err) return console.error('Log Error:', err);

    const newLog = {
      id: result.insertId || Date.now(),
      rfid_data: rfid_data,
      rfid_status: status,
      time_log: new Date().toISOString()
    };
    if (callback) callback(newLog);
  });
}

// --- MQTT PUBLISH ---
function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
}

// --- API ---
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ORDER BY rfid_data", (err, resDb) => {
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
