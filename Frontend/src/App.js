import React, { useEffect, useState, useCallback } from "react";
import io from 'socket.io-client';


const API_URL = 'http://localhost:3001';
const socket = io(API_URL);

function App() {
  
  const [statusList, setStatusList] = useState([]);
  const [logList, setLogList] = useState([]);

  
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

  
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  
  useEffect(() => {
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

    console.log("Setting up 5-second polling for external DB changes...");
    const interval = setInterval(() => {
      console.log("Polling database for external changes...");
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

  
  const handleToggle = (rfid_data) => {
    console.log("Toggling:", rfid_data);

    fetch(`${API_URL}/api/toggle/${rfid_data}`, {
      method: 'POST',
    })
      .then(res => res.json())
      .then(response => console.log("Server Response:", response.message))
      .catch(error => console.error("Error toggling:", error));
  };

  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      
      <nav className="bg-blue-600 text-white px-6 py-5 flex justify-between items-center shadow-md">
        <h1 className="text-4xl font-extrabold tracking-wide">BSIT IT413</h1>
        
      </nav>

      
      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        
        
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Registered RFID</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4 text-left"></th>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-center">Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {statusList.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50">
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

        
        <div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">RFID Logs</h2>
          <div className="overflow-x-auto bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 uppercase text-xs sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left"></th>
                  <th className="py-3 px-4 text-left">RFID</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logList.map((log, index) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700 font-semibold text-center">{index + 1}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{log.rfid_data}</td>
                    <td className="py-3 px-4">
                      {log.rfid_status === 1 ? (
                        <span className="text-green-600 font-medium">Logged In</span>
                      ) : log.rfid_status === 0 ? (
                        <span className="text-red-600 font-medium">Logged Out</span>
                      ) : (
                        <span className="text-yellow-600 font-medium">RFID Not Found</span>
                      )}
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
