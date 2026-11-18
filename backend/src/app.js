import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import shiftRoutes from './routes/shiftRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import kitchenRoutes from './routes/kitchenRoutes.js';
import { errorMiddleware } from './middlewares/errorMiddleware.js';

const app = express();

app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/tables', tableRoutes);
app.use('/shifts', shiftRoutes);
app.use('/kitchen', kitchenRoutes);
app.use(orderRoutes);
app.use(errorMiddleware);

export default app;