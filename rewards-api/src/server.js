import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
const config=loadConfig();
const pool=createPool(config);
const server=createApp({pool,config}).listen(config.port,'0.0.0.0',()=>console.log(`Rewards API listening on ${config.port}`));
const shutdown=async(signal)=>{
  console.log(`${signal} received; closing Rewards API`);
  server.close(async()=>{await pool.end();process.exit(0)});
  setTimeout(()=>process.exit(1),25_000).unref();
};
process.once('SIGTERM',()=>shutdown('SIGTERM'));
process.once('SIGINT',()=>shutdown('SIGINT'));
