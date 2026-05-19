import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { globalLimiter } from './middlewares/rate-limiter.middleware';
import { sendError } from './utils/response';
import { env } from './config/env';

const app = express();

// Security and utility middlewares
app.use(helmet());

const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? allowedOrigins : '*',
    credentials: true,
  }),
);

app.use(express.json({ limit: '10kb' }));

if (env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.use(globalLimiter);

// API Routes
app.use('/api/v1', routes);

// 404 Handler
app.use('*', (req, res) => {
  sendError(res, 404, `Route ${req.originalUrl} not found on this server`);
});

// Global Error Handler
app.use(errorHandler);

export default app;
