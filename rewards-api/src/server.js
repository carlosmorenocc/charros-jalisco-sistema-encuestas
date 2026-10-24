import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
const config=loadConfig();
const pool=createPool(config);
createApp({pool,config}).listen(config.port,'0.0.0.0',()=>console.log(`Rewards API listening on ${config.port}`));
