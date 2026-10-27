import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import { hashPassword } from '../src/security.js';

const accounts = [
  ['Carlos Moreno','carlos.moreno@charrosdejalisco.com','administrator'],
  ['César Carrasco','cesar.carrasco@charrosdejalisco.com','operator'],
  ['Mariette Dueñas','mariette.duenas@charrosdejalisco.com','operator'],
  ['Blanca Ruvalcaba','esmeralda.ruvalcaba@charrosdejalisco.com','operator']
];
const approvedOperatorEmails = accounts
  .filter(([, , role]) => role === 'operator')
  .map(([, email]) => email);
const requestedEmailIndex=process.argv.indexOf('--email');
const requestedEmail=requestedEmailIndex>=0?String(process.argv[requestedEmailIndex+1]||'').trim().toLowerCase():'';
const selectedAccounts=requestedEmail?accounts.filter(([,email])=>email===requestedEmail):accounts;
if(!selectedAccounts.length) throw new Error(`Cuenta no reconocida: ${requestedEmail}`);
const config=loadConfig(), pool=createPool(config), terminal=readline.createInterface({input:stdin,output:stdout,terminal:true});
try {
  await transaction(pool,async(client)=>{
    await client.query(`
      UPDATE rewards_users
      SET active=false,updated_at=now()
      WHERE role='operator' AND NOT (email=ANY($1::text[]))
    `,[approvedOperatorEmails]);
    for(const [name,email,role] of selectedAccounts){
      const password=await terminal.question(`Contraseña temporal para ${name}: `,{hideEchoBack:true});
      const confirmation=await terminal.question('Confirmar: ',{hideEchoBack:true});
      if(password!==confirmation) throw new Error(`Las contraseñas de ${name} no coinciden`);
      if(password.length<12) throw new Error(`La contraseña temporal de ${name} debe contener al menos 12 caracteres`);
      const passwordHash=await hashPassword(password,config.passwordPepper);
      await client.query(`INSERT INTO rewards_users(display_name,email,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,true) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,must_change_password=true,active=true,updated_at=now()`,[name,email,role,passwordHash]);
      await client.query(`UPDATE rewards_sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM rewards_users WHERE email=$1) AND revoked_at IS NULL`,[email]);
    }
  });
  console.log(`${selectedAccounts.length===1?'Cuenta provisionada':'Cuentas provisionadas'}; se exigirá cambio de contraseña al ingresar.`);
} finally { terminal.close(); await pool.end(); }
