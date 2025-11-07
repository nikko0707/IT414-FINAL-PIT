import React, { useEffect, useState } from "react";

// The URL to your PHP files in XAMPP
const API_URL = 'http://localhost/lab2'; // Or /lab2, whatever you named it

function App() {
  // --- STATE ---
  // State for your 'rfid_reg' table
  const [statusList, setStatusList] = useState([]);
  // State for your 'rfid_logs' table
  const [logList, setLogList] = useState([]);

  // --- DATA FETCHING ---

  // Fetches the 'rfid_reg' table data
  const fetchStatus = () => {
    fetch(`${API_URL}/get_status.php`)
      .then(res => res.json())
      .then(data => setStatusList(data))
      .catch(error => console.error("Error fetching status:", error));
  };

  // Fetches the 'rfid_logs' table data
  const fetchLogs = () => {
    fetch(`${API_URL}/get_logs.php`)
      .then(res => res.json())
      .then(data => setLogList(data))
      .catch(error => console.error("Error fetching logs:", error));
  };

  // --- INITIAL LOAD ---
  // Runs once when the page loads
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, []);

  // --- AUTO REFRESH ---
  // This meets the project requirement 
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Auto-refreshing data...");
      fetchStatus();
      fetchLogs();
    }, 5000); // Refreshes every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---
  // This function sends data to your 'process_rfid.php'
  // This is for your toggle button [cite: 15]
  const handleToggle = (rfid_data) => {
    console.log("Toggling:", rfid_data);

    const body = new URLSearchParams();
    body.append('rfid_data', rfid_data);

    fetch(`${API_URL}/process_rfid.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    })
      .then(res => res.text())
      .then(response => {
        console.log("Server Response:", response);
        // After toggling, instantly refresh the data on screen
        fetchStatus();
        fetchLogs();
      })
      .catch(error => console.error("Error toggling:", error));
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Navbar (Your code) */}
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
    <th className="py-3 px-4 text-left">#</th>
    <th className="py-3 px-4 text-left">RFID</th>
    <th className="py-3 px-4 text-left">Status (1 or 0)</th>
    <th className="py-3 px-4 text-center">Toggle [cite: 15]</th>
  </tr>
</thead>
<tbody>
  {statusList.map((item, index) => (
    <tr key={item.id} className="border-t hover:bg-gray-50">
      <td className="py-3 px-4 text-gray-700 font-semibold text-center">{index + 1}</td>
      <td className="py-3 px-4 font-mono">{item.rfid_data}</td>

                    <td className="py-3 px-4">
                      {item.rfid_status === 1 ? (
                        <span className="text-green-600 font-medium">Active (1)</span>
                      ) : (
                        <span className="text-red-600 font-medium">Inactive (0)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {/* Your Toggle Switch UI */}
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
    <th className="py-3 px-4 text-left">#</th>
    <th className="py-3 px-4 text-left">RFID</th>
    <th className="py-3 px-4 text-left">Status</th>
    <th className="py-3 px-4 text-left">Date & Time</th>
  </tr>
</thead>
<tbody>
  {logList.map((log, index) => (
    <tr key={log.id} className="border-t hover:bg-gray-50">
      <td className="py-3 px-4 text-gray-700 font-semibold text-center">{index + 1}</td>
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