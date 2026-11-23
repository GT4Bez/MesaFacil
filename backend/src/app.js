import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import shiftRoutes from './routes/shiftRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import kitchenRoutes from './routes/kitchenRoutes.js';
import menuItemRoutes from './routes/menuItemRoutes.js';
import ingredientRoutes from './routes/ingredientRoutes.js';
import userRoutes from './routes/userRoutes.js';
import meRoutes from './routes/meRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { errorMiddleware } from './middlewares/errorMiddleware.js';

const app = express();

// Spec 018: o navegador só lê o nome do CSV (Content-Disposition) se o header for exposto.
app.use(cors({ origin: env.corsOrigins, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/tables', tableRoutes);
app.use('/shifts', shiftRoutes);
app.use('/kitchen', kitchenRoutes);
app.use('/menu-items', menuItemRoutes);
app.use('/ingredients', ingredientRoutes);
app.use('/users', userRoutes);
app.use('/me', meRoutes);
app.use('/audit-logs', auditRoutes);
app.use(orderRoutes);
app.use(errorMiddleware);

export default app;