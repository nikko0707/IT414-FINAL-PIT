/*
 BACKEND SERVER
 added 10-minute global inactivity timer, to automatically deactivate ID after a long period of not scanning.
 */

const http = require('http'); //web server
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors'); // To prevent browser errors

//import mqtt and mysql
const mqtt = require('mqtt');
const mysql = require('mysql');

//specific configurations
const MQTT_BROKER = 'mqtt://10.71.207.215'; //IP Address
const MQTT_TOPIC_SCAN = 'RFID_SCAN'; //makita sa mqttx if na scan ba gid imo rfid card
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN'; //1 or 0 
const WEB_SERVER_PORT = 3001; //port for web server

//auto-lock timer
const AUTO_LOCK_DELAY_MS = 10 * 60 * 1000; // 10 minutes
let globalInactivityTimer = null;

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'It414_db_BLOCK30'
};

const app = express();         // express web app
app.use(cors());               //cors middleware
const server = http.createServer(app); // HTTP server
const io = new Server(server, { // Attach Socket.io for real-time
  cors: {
    origin: "*", // Allow all connections
  }
});

let db;
const mqttClient = mqtt.connect(MQTT_BROKER);

//database
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

//timer
function setAllCardsInactive() {
  console.log(`10 minutes of inactivity. Setting all cards to 0.`);
  db.query("UPDATE rfid_reg SET rfid_status = 0");
  
  globalInactivityTimer = null; // Timer has fired
}

function resetInactivityTimer() {
  if (globalInactivityTimer) {
    clearTimeout(globalInactivityTimer);
  }
  console.log("Activity detected, resetting 10-minute inactivity timer...");
  globalInactivityTimer = setTimeout(setAllCardsInactive, AUTO_LOCK_DELAY_MS);
}


// mqtt logic
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC_SCAN, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${MQTT_TOPIC_SCAN}`);
      resetInactivityTimer();
    }
  });
});

mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    //reset timer on each scan
    resetInactivityTimer();

    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    processRfidData(rfid_data); // Run your logic
  }
});

//database logic
function processRfidData(rfid_data) {
  const sql_check_reg = "SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?";

  db.query(sql_check_reg, [rfid_data], (err, results) => {
    if (err) {
      console.error('DB query error (check_reg):', err);
      publishResult('0');
      return;
    }

    //default publish value
    let signal_to_publish = '0';

    //Registered RFID
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

          //log the scan
          logScan(rfid_data, new_status, (newLog) => {
            if (newLog) io.emit('new_log', newLog);
          });

          io.emit('status_update', { rfid: rfid_data, status: new_status });
          console.log(`RFID ${rfid_data} found. Toggling to ${new_status}. Publishing: ${signal_to_publish}`);

          publishResult(signal_to_publish);
        }
      );

      return;
    }

    // RFID not found
    db.query("SELECT COUNT(*) AS reg_count FROM rfid_reg", (cntErr, count_results) => {
      if (cntErr) {
        console.error('DB query error (count):', cntErr);
        publishResult('0');
        return;
      }

      const reg_count = (count_results && count_results[0]) ? count_results[0].reg_count : 0;

      //Auto-register if < 3
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

            // log the scan
            logScan(rfid_data, new_status, (newLog) => {
              if (newLog) io.emit('new_log', newLog);
            });

            // Confirm the inserted row
            db.query(
              "SELECT * FROM rfid_reg WHERE rfid_data = ?",
              [rfid_data],
              (selErr, rows) => {
                if (selErr) {
                  console.error("DB SELECT error after insert:", selErr);
                  //publish 1 because insert succeeded
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

        return;
      }

      //rfid_reg > 3 dili na iregister, log as NOT FOUND and publish 0
      logScan(rfid_data, 2, (newLog) => {
        if (newLog) io.emit('new_log', newLog);
      });

      const signal_to_publish = '0';
      console.log(`RFID ${rfid_data} NOT FOUND. Max (3) IDs registered. Publishing: ${signal_to_publish}`);
      publishResult(signal_to_publish);
    });
  });
}

//log scans
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


// publish
function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal);
}

// API Endpoint GET all registered cards
app.get('/api/status', (req, res) => {
  db.query("SELECT * FROM rfid_reg ", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// API Endpoint GET all the past logs newest first
app.get('/api/logs', (req, res) => {
  db.query("SELECT * FROM rfid_logs ORDER BY time_log DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

//server start
server.listen(WEB_SERVER_PORT, () => {
  console.log(`Web server listening on http://localhost:${WEB_SERVER_PORT}`);
});