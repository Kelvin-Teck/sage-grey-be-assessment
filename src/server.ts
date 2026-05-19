import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { db } from './config/database';

const PORT = env.PORT || 3000;

const startServer = async () => {
  try {
    // Verify database connection
    await db.raw('SELECT 1');
    logger.info('Database connection established successfully.');


    const server = app.listen(PORT, () => {
      logger.info(`Server is running on http://localhost:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/api/v1/health`);
    });

    // Graceful Shutdown Mechanism
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);

      // Force exit if graceful shutdown takes longer than 10 seconds
      const timer = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded. Forcing process exit.');
        process.exit(1);
      }, 10000);

      server.close(async () => {
        logger.info('HTTP server closed. No longer accepting new connections.');
        try {
          await db.destroy();
          logger.info('Database connection pool closed successfully.');
          clearTimeout(timer);
          process.exit(0);
        } catch (err) {
          logger.error('Error during database pool closure:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
