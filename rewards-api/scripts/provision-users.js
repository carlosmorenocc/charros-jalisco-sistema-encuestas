import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const accounts = [
  ['Carlos Moreno','carlos.moreno@charrosdejalisco.com','administrator'],
  ['Cesar Carrasco','cesar.carrasco@charrosdejalisco.com','operator'],
  ['Mariette Dueñas','mariette.guillen@charrosdejalisco.com','operator'],
  ['Esmeralda Ruvalcaba','esmeralda.ruvalcaba@charrosdejalisco.com','operator']
];
const config=loadConfig(), pool=createPool(config), terminal=readline.createInterface({input:stdin,output:stdout,terminal:true});
try {
  await transaction(pool,async(client)=>{
    for(const [name,email,role] of accounts){
      const password=await terminal.question(`Contraseña temporal para ${name}: `,{hideEchoBack:true});
      const confirmation=await terminal.question('Confirmar: ',{hideEchoBack:true});
      if(password!==confirmation) throw new Error(`Las contraseñas de ${name} no coinciden`);
      const passwordHash=await hashPassword(password,config.passwordPepper);
      await client.query(`INSERT INTO rewards_users(display_name,email,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,true) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,must_change_password=true,active=true,updated_at=now()`,[name,email,role,passwordHash]);
      await client.query(`UPDATE rewards_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM rewards_users WHERE email=$1) AND revoked_at IS NULL`,[email]);
    }
  });
  console.log('Cuentas provisionadas; todas exigirán cambio de contraseña.');
} finally { terminal.close(); await pool.end(); }
