// app/services/backend.js
import io from "socket.io-client";
import axios from "axios";

// Use your laptop IP
const SERVER_IP = "http://192.168.1.108:3001";

export const socket = io(SERVER_IP, {
  transports: ["websocket"],
  reconnection: true,
});

export const api = axios.create({
  baseURL: SERVER_IP + "/api",
});
