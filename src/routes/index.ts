import { Router } from 'express';
import authRoutes from './auth.routes';
import walletRoutes from './wallet.routes';
import { sendSuccess } from '../utils/response';

const router = Router();

router.get('/health', (req, res) => {
  sendSuccess(res, 200, 'Sage Grey Backend API is up and running');
});

router.use('/auth', authRoutes);
router.use('/wallet', walletRoutes);

export default router;
