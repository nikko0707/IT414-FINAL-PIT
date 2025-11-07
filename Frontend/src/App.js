import React, { useEffect, useState } from "react";
import io from 'socket.io-client'; // <-- CHANGED: Import the socket library

// --- CHANGED: This now points to your Node.js backend ---
const API_URL = 'http://localhost:3000'; 
const socket = io(API_URL); // <-- CHANGED: Connect to the socket server

function App() {
  // --- STATE (Your code, unchanged) ---
  const [statusList, setStatusList] = useState([]);
  const [logList, setLogList] = useState([]);

  // --- DATA FETCHING (Your code, with changed URLs) ---
  const fetchStatus = () => {
    fetch(`${API_URL}/api/status`) // <-- CHANGED: New URL
      .then(res => res.json())
      .then(data => setStatusList(data))
      .catch(error => console.error("Error fetching status:", error));
  };

  const fetchLogs = () => {
    fetch(`${API_URL}/api/logs`) // <-- CHANGED: New URL
      .then(res => res.json())
      .then(data => setLogList(data))
      .catch(error => console.error("Error fetching logs:", error));
  };

  // --- INITIAL LOAD (Your code, unchanged) ---
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, []);

  // --- AUTO REFRESH (CHANGED: Now uses Sockets for real-time) ---
  useEffect(() => {
    console.log("Connecting to socket server...");

    // This listens for 'new_log' events from your backend.js
    socket.on('new_log', (newLog) => {
      console.log("Socket: Received new_log", newLog);
      // Adds the new log to the top of the list instantly
      setLogList(currentLogs => [newLog, ...currentLogs]);
    });

    // This listens for 'status_update' events
    socket.on('status_update', (update) => {
      console.log("Socket: Received status_update", update);
      // Finds and updates the item in the status list
      setStatusList(currentList =>
        currentList.map(item =>
          item.rfid_data === update.rfid
            ? { ...item, rfid_status: update.status }
            : item
        )
      );
    });

    // Clean up the listeners
    return () => {
      socket.off('new_log');
      socket.off('status_update');
    };
  }, []); // Empty array means this runs only once

  // --- ACTIONS (CHANGED: Updated toggle function) ---
  const handleToggle = (rfid_data) => {
    console.log("Toggling:", rfid_data);

    // This now sends the request to your Node.js API
    fetch(`${API_URL}/api/toggle/${rfid_data}`, {
      method: 'POST',
    })
      .then(res => res.json())
      .then(response => {
        console.log("Server Response:", response);
        // We don't need to refresh here!
        // The socket will send the update automatically.
      })
      .catch(error => console.error("Error toggling:", error));
  };

  // --- RENDER (Your code, 100% unchanged) ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Navbar */}
      <nav className="bg-blue-600 text-white px-6 py-5 flex justify-between items-center shadow">
        <h1 className="text-4xl font-extrabold tracking-wide">BSIT 413</h1>
        <button
          onClick={() => {
            fetchStatus();
            fetchLogs();
          }}
          className="bg-white text-blue-600 px-4 py-1 rounded-md font-medium hover:bg-blue-100 transition"
        >
          Refresh
        </button>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* --- RFID STATUS TABLE --- */}
        <div>
          <h2 className="text-2xl font-bold mb-4">RFID Status</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status (1 or 0)</th>
                  <th className="py-3 px-4 text-center">Toggle [cite: 15]</th>
                </tr>
              </thead>
              <tbody>
                {statusList.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono">{item.rfid_data}</td>
                    <td className="py-3 px-4">
                      {item.rfid_status === 1 ? (
                        <span className="text-green-600 font-medium">Active (1)</span>
                      ) : (
                        <span className="text-red-600 font-medium">Inactive (0)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={item.rfid_status === 1}
                          onChange={() => handleToggle(item.rfid_data)}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- RFID LOGS TABLE --- */}
        <div>
          <h2 className="text-2xl font-bold mb-4">RFID Logs</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {logList.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono">{log.rfid_data}</td>
                    <td className="py-3 px-4">
                      {log.rfid_status === 1 ? (
                        <span className="text-green-600">Logged In</span>
                      ) : (
                        <span className="text-red-600">Logged Out/Failed</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {new Date(log.time_log).toLocaleString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;