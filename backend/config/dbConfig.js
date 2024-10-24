import mysql from "mysql2/promise";

const createPool = () => {
  const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "Ashish@123",
    database: "weather_monitoring",
  });

  return pool;
};

const db = createPool();

export default db;
