import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
const port = process.env.PORT || 3001;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'MesaFácil API', status: 'ok' });
});

// Verifica se a API está no ar e se consegue falar com o banco
app.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT now() AS now');
    res.json({ api: 'ok', db: 'ok', dbTime: rows[0].now });
  } catch (err) {
    res.status(503).json({ api: 'ok', db: 'error', message: err.message });
  }
});

app.listen(port, () => {
  console.log(`MesaFácil API rodando em http://localhost:${port}`);
});
