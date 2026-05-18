import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { validate } from '../middlewares/validate.middleware';
import { AuthGuard } from '../middlewares/auth.middleware';
import { IdempotencyGuard } from '../middlewares/idempotency.middleware';
import { amountSchema, transferSchema } from '../validators/wallet.validator';

const router = Router();
const walletController = new WalletController();

// Require auth and idempotency protection for all wallet routes
router.use(AuthGuard, IdempotencyGuard);

router.get('/', walletController.getWallet);
router.post('/fund', validate(amountSchema), walletController.fund);
router.post('/withdraw', validate(amountSchema), walletController.withdraw);
router.post('/transfer', validate(transferSchema), walletController.transfer);

export default router;
