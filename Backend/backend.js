/*
 * BACKEND SERVER (Node.js)
 * This code REPLACES your 'process_rfid.php' file.
 * It connects to your MQTT broker and your MySQL database.
 *
 * It LISTENS for scans on 'RFID_SCAN'.
 * It PUBLISHES results on 'RFID_LOGIN'.
 */

const mqtt = require('mqtt');
const mysql = require('mysql');

// --- Configs ---
const MQTT_BROKER = 'mqtt://YOUR_MQTT_BROKER_IP'; // <-- Use 'mqtt://'
const MQTT_TOPIC_SCAN = 'RFID_SCAN';       // Listen for scans here
const MQTT_TOPIC_LOGIN = 'RFID_LOGIN';     // Publish results here [cite: 49]

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'It414_db_BLOCK30'
};

// --- Create Connections ---
let db;
const mqttClient = mqtt.connect(MQTT_BROKER);

// --- Database Connection (with auto-reconnect) ---
function handleDbConnection() {
  db = mysql.createConnection(DB_CONFIG);

  db.connect(err => {
    if (err) {
      console.error('Error connecting to DB:', err);
      setTimeout(handleDbConnection, 2000); // Try again
    } else {
      console.log('Successfully connected to MySQL database.');
    }
  });

  db.on('error', err => {
    console.error('DB error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      handleDbConnection(); // Reconnect
    } else {
      throw err;
    }
  });
}

handleDbConnection(); // Start DB connection

// --- MQTT Logic ---

// When MQTT connects
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker at ${MQTT_BROKER}`);
  // Subscribe to the scanner's topic
  mqttClient.subscribe(MQTT_TOPIC_SCAN, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${MQTT_TOPIC_SCAN}`);
    }
  });
});

// When a message arrives from the scanner
mqttClient.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_SCAN) {
    const rfid_data = message.toString();
    console.log(`Received scan: ${rfid_data}`);
    // Run your database logic
    processRfidData(rfid_data);
  }
});

// This is your PHP logic, translated to JavaScript
function processRfidData(rfid_data) {
  const sql_check_reg = "SELECT rfid_status FROM rfid_reg WHERE rfid_data = ?";
  
  db.query(sql_check_reg, [rfid_data], (err, results) => {
    if (err) return console.error('DB query error:', err);

    let signal_to_publish = '0'; // Default is '0' (fail/off)

    if (results.length > 0) {
      // --- RFID IS REGISTERED ---
      const current_status = results[0].rfid_status;
      const new_status = (current_status == 1) ? 0 : 1; // Toggle status
      
      // The signal to publish is '1' for ON, '0' for OFF
      signal_to_publish = (new_status == 1) ? '1' : '0'; 

      // Update the status in the database
      const sql_update = "UPDATE rfid_reg SET rfid_status = ? WHERE rfid_data = ?";
      db.query(sql_update, [new_status, rfid_data]);

      logScan(rfid_data, new_status); // Log the new status
      console.log(`RFID ${rfid_data} found. Toggling to ${new_status}. Publishing: ${signal_to_publish}`);

    } else {
      // --- RFID NOT FOUND ---
      // Your auto-register logic
      const sql_check_existing = "SELECT COUNT(*) AS reg_count FROM rfid_reg";
      db.query(sql_check_existing, (err, count_results) => {
        if (err) return console.error('DB query error:', err);

        const reg_count = count_results[0].reg_count;
        if (reg_count == 0) {
          // Register the card with status 1 (active)
          const sql_register = "INSERT INTO rfid_reg (rfid_data, rfid_status) VALUES (?, 1)";
          db.query(sql_register, [rfid_data]);
          logScan(rfid_data, 1);
          signal_to_publish = '1'; // Publish '1' since it's now active
          console.log(`RFID ${rfid_data} NOT FOUND. Auto-registering. Publishing: ${signal_to_publish}`);
        } else {
          // Card not found, and table is not empty. Log as failed.
          logScan(rfid_data, 0);
          signal_to_publish = '0'; // Publish '0'
          console.log(`RFID ${rfid_data} NOT FOUND. Publishing: ${signal_to_publish}`);
        }
        
        // Publish the final signal
        publishResult(signal_to_publish);
      });
      return; // Exit here because the query is async
    }

    // Publish the final signal
    publishResult(signal_to_publish);
  });
}

// Helper function to log every scan
function logScan(rfid_data, status) {
  // Uses NOW() for timestamp. Your PHP used DATE_FORMAT, but this is simpler.
  const sql_log = "INSERT INTO rfid_logs (time_log, rfid_data, rfid_status) VALUES (NOW(), ?, ?)";
  db.query(sql_log, [rfid_data, status], (err) => {
    if (err) console.error('Log insert error:', err);
  });
}

// Helper function to publish the result
function publishResult(signal) {
  mqttClient.publish(MQTT_TOPIC_LOGIN, signal, (err) => {
    if (err) {
      console.error('Failed to publish:', err);
    } else {
      console.log(`Successfully published '${signal}' to ${MQTT_TOPIC_LOGIN}`);
    }
  });
}