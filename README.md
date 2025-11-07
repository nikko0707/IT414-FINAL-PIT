To fully run this app follow these instructions well
1. Clone the repository to your desired path || git clone https://github.com/nikko0707/IT414-FINAL-PIT.git
2. Install socket.io client to your frontend || npm install socket.io-client
3. Install socket.io to your backend || npm install express cors socket.io
4. Create a bat file named start-broker in mosquitto || C:\Program Files\mosquitto || 
@echo off
cd "C:\Program Files\mosquitto"
echo Starting Mosquitto broker...
mosquitto.exe -c mosquitto.conf -v
5. Create a conf file named mosquitto.conf in mosquitto || C:\Program Files\mosquitto  || 
# This tells Mosquitto to listen on the default MQTT port
listener 1883
# This lets your ESP32s connect without a username or password
allow_anonymous true
6. Connect your components and upload your relay and scanner to their assigned esp individually
7. Open the MQTTX and create a new connection, put your IP address and confirm
8. Add a new subscription and name it RFID_LOGIN, do the same for RFID_SCAN
9. Double click bat file to run it, make sure your firewall accepts mosquitto.exe file in public and private networks.
10. Install npm for both frontend and backend apps
11. Run your frontend app || npm start
12. Run your backend app || node backend.js
13. Monitor both the relay and scanner
14. You're all set, Good luck! 
15. HAPPY CODING!!!
