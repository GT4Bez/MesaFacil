import './config/env.js';
import app from './app.js';
import { env } from './config/env.js';
import { DatabaseConnection } from './database/DatabaseConnection.js';

const server = app.listen(env.port, () => {
  console.log(`MesaFácil API rodando na porta ${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando servidor...`);
  server.close(async () => {
    if (DatabaseConnection.instance) {
      await DatabaseConnection.instance.close();
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));