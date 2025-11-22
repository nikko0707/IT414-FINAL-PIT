import React, { useEffect, useState, useCallback } from "react";
import io from 'socket.io-client';

// --- CONFIGURATION ---
// This connects to your Node.js backend running on the same computer
const API_URL = 'http://localhost:3001';
const socket = io(API_URL);

function App() {
  
  // --- STATE ---
  const [statusList, setStatusList] = useState([]);
  const [logList, setLogList] = useState([]);

  // --- DATA FETCHING ---
  const fetchStatus = useCallback(() => {
    fetch(`${API_URL}/api/status`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStatusList(data);
        } else {
          console.error("Error: /api/status did not return an array:", data);
          setStatusList([]);
        }
      })
      .catch(error => {
         console.error("Error fetching status:", error);
         setStatusList([]);
      });
  }, []);

  const fetchLogs = useCallback(() => {
    fetch(`${API_URL}/api/logs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLogList(data);
        } else {
          console.error("Error: /api/logs did not return an array:", data);
          setLogList([]);
        }
      })
      .catch(error => {
        console.error("Error fetching logs:", error);
        setLogList([]);
      });
  }, []);

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  // --- REAL-TIME LISTENERS ---
  useEffect(() => {
    console.log("Setting up socket listeners...");

    // 1. New Log Entry
    socket.on('new_log', (newLog) => {
      console.log('Socket: Received new_log', newLog);
      setLogList(currentLogs => [newLog, ...currentLogs]);
    });

    // 2. Status Update (Active/Inactive)
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

    // 3. New Registration
    socket.on('new_status_item', (newItem) => {
      console.log('Socket: Received new_status_item', newItem);
      setStatusList(currentList => [...currentList, newItem].sort((a, b) => a.id - b.id));
    });

    // 4. Polling Fallback (5 seconds)
    console.log("Setting up 5-second polling...");
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 5000);

    return () => {
      socket.off('new_log');
      socket.off('status_update');
      socket.off('new_status_item');
      clearInterval(interval);
    };
  }, [fetchStatus, fetchLogs]);

  // --- HELPER: CHECK REGISTRATION ---
  // This determines if an ID is "Logged Out" or "Not Found"
  const isRegistered = (rfid) => {
    return statusList.some(item => item.rfid_data === rfid);
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      
      {/* Navbar */}
      <nav className="bg-blue-600 text-white px-6 py-5 flex justify-between items-center shadow-md">
        <h1 className="text-4xl font-extrabold tracking-wide">BSIT IT414</h1>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        
        {/* --- TABLE 1: REGISTERED RFID --- */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Registered RFID</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4 text-left">#</th>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-center">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {statusList.map((item, index) => (
                  <tr key={item.id || index} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700 font-semibold text-center">{index + 1}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{item.rfid_data}</td>
                    <td className="py-3 px-4">
                      {item.rfid_status === 1 ? (
                        <span className="text-green-600 font-medium">Active (1)</span>
                      ) : (
                        <span className="text-red-600 font-medium">Inactive (0)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {/* READ-ONLY TOGGLE */}
                      <label className="relative inline-flex items-center cursor-not-allowed">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={item.rfid_status === 1}
                          readOnly
                          disabled 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 opacity-70"></div>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- TABLE 2: RFID LOGS --- */}
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">RFID Logs</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left">#</th>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logList.map((log, index) => {
                  // --- LOGIC START ---
                  // Check if this log's RFID exists in the registered list
                  const isReg = isRegistered(log.rfid_data);
                  let statusText, statusClass;

                  if (!isReg) {
                    // If NOT in registered list -> It is "Not Found"
                    statusText = "RFID Not Found";
                    statusClass = "text-yellow-600 font-medium";
                  } else if (log.rfid_status === 1) {
                    // If in list AND status is 1 -> "Logged In"
                    statusText = "Logged In";
                    statusClass = "text-green-600 font-medium";
                  } else {
                    // If in list AND status is 0 -> "Logged Out"
                    statusText = "Logged Out";
                    statusClass = "text-red-600 font-medium";
                  }
                  // --- LOGIC END ---

                  return (
                    <tr key={log.id || index} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-700 font-semibold text-center">{index + 1}</td>
                      <td className="py-3 px-4 font-mono text-gray-700">{log.rfid_data}</td>
                      <td className="py-3 px-4">
                        <span className={statusClass}>{statusText}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(log.time_log).toLocaleString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true, // AM/PM Format
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;