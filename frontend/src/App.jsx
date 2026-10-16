import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>🍽️ MesaFácil</h1>
      <p>Frontend: ok</p>
      {error && <p style={{ color: 'red' }}>Erro ao falar com a API: {error}</p>}
      {!health && !error && <p>Verificando API...</p>}
      {health && (
        <>
          <p>API: {health.api}</p>
          <p>Banco: {health.db}</p>
          {health.dbTime && <p>Hora do banco: {health.dbTime}</p>}
        </>
      )}
    </main>
  );
}
