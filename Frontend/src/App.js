import React, { useEffect, useState, useCallback } from "react";
import io from 'socket.io-client'; // Import socket.io

// --- NEW CONFIG ---
// The URL of your new Node.js backend
const API_URL = 'http://localhost:3001';
// Connect to the Socket.io server
const socket = io(API_URL);

function App() {
  // --- STATE ---
  const [statusList, setStatusList] = useState([]);
  const [logList, setLogList] = useState([]);

  // --- DATA FETCHING ---
  // We use useCallback to prevent these functions from causing re-renders
  const fetchStatus = useCallback(() => {
    fetch(`${API_URL}/api/status`) // Fetch from Node.js
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStatusList(data); // Only set if data is an array
        } else {
          console.error("Error: /api/status did not return an array:", data);
          setStatusList([]); // Set to empty array to prevent crash
        }
      })
      .catch(error => {
         console.error("Error fetching status:", error);
         setStatusList([]); // Set to empty array on fetch error
      });
  }, []);

  const fetchLogs = useCallback(() => {
    fetch(`${API_URL}/api/logs`) // Fetch from Node.js
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLogList(data); // Only set if data is an array
        } else {
          console.error("Error: /api/logs did not return an array:", data);
          setLogList([]); // Set to empty array to prevent crash
        }
      })
      .catch(error => {
        console.error("Error fetching logs:", error);
        setLogList([]); // Set to empty array on fetch error
      });
  }, []);

  // --- INITIAL LOAD ---
  useEffect(() => {
    // Fetch initial data when page loads
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]); // Add dependencies

  // --- REAL-TIME REFRESH (Two Methods) ---
  useEffect(() => {
    
    // METHOD 1: Socket.io (Instant updates for scans/toggles)
    console.log("Setting up socket listeners...");

    socket.on('new_log', (newLog) => {
      console.log('Socket: Received new_log', newLog);
      setLogList(currentLogs => [newLog, ...currentLogs]);
    });

    socket.on('status_update', (update) => {
      console.log('Socket: Received status_update', update);
      setStatusList(currentList =>
        currentList.map(item =>
          item.rfid_data === update.rfid
            ? { ...item, rfid_status: update.status }
            : item
        )
      );
    });

    socket.on('new_status_item', (newItem) => {
      console.log('Socket: Received new_status_item', newItem);
      setStatusList(currentList => [...currentList, newItem]);
    });

    // METHOD 2: Polling (Catches external DB changes, like from instructor)
    // This meets your new requirement.
    console.log("Setting up 5-second polling for external DB changes...");
    const interval = setInterval(() => {
      console.log("Polling database for external changes...");
      fetchStatus();
      fetchLogs();
    }, 5000); // Polls every 5 seconds

    // Clean up all listeners
    return () => {
      socket.off('new_log');
      socket.off('status_update');
      socket.off('new_status_item');
      clearInterval(interval);
    };
  }, [fetchStatus, fetchLogs]); // Add dependencies

  // --- ACTIONS (Toggle) ---
  const handleToggle = (rfid_data) => {
    console.log("Toggling:", rfid_data);

    fetch(`${API_URL}/api/toggle/${rfid_data}`, {
      method: 'POST',
    })
      .then(res => res.json())
      .then(response => console.log("Server Response:", response.message))
      .catch(error => console.error("Error toggling:", error));
  };

  // --- RENDER (Your exact UI, unchanged) ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Navbar */}
      <nav className="bg-blue-600 text-white px-6 py-5 flex justify-between items-center shadow-md">
        <h1 className="text-4xl font-extrabold tracking-wide">BSIT 413</h1>
        {/* REFRESH BUTTON REMOVED AS REQUESTED */}
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        
        {/* --- RFID STATUS TABLE --- */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">RFID Status</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status (1 or 0)</th>
                  <th className="py-3 px-4 text-center">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {statusList.map((item) => (
                  <tr key={item.rfid_data} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-gray-700">{item.rfid_data}</td>
                    <td className="py-3 px-4">
                      {/* This just indicates status as requested */}
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
          <h2 className="text-2xl font-bold mb-4 text-gray-800">RFID Logs</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logList.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-gray-700">{log.rfid_data}</td>
                    <td className="py-3 px-4">
                      {/* +++++ THIS IS YOUR NEW LOGIC +++++ */}
                      {log.rfid_status === 1 ? (
                        <span className="text-green-600 font-medium">Logged In</span>
                      ) : log.rfid_status === 0 ? (
                        <span className="text-red-600 font-medium">Logged Out</span>
                      ) : (
                        <span className="text-yellow-600 font-medium">RFID Not Found</span>
                      )}
                      {/* ++++++++++++++++++++++++++++++++++ */}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
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