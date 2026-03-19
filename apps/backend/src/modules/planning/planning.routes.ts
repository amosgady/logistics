import { Router } from 'express';
import { planningController } from './planning.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('COORDINATOR', 'ADMIN'));

router.get('/board', planningController.getBoard);
router.post('/assign-truck', planningController.assignOrderToTruck);
router.post('/assign-installer', planningController.assignOrderToInstaller);
router.delete('/orders/:orderId/unassign', planningController.removeOrderFromTruck);
router.patch('/routes/:routeId/reorder', planningController.reorderRoute);
router.post('/routes/:routeId/time-windows', planningController.assignTimeWindows);
router.post('/routes/:routeId/optimize', planningController.optimizeRoute);
router.post('/routes/:routeId/approve-overtime', planningController.approveOvertime);
router.post('/routes/:routeId/send-to-coordination', planningController.sendToCoordination);
router.post('/geocode', planningController.geocodeOrders);
router.post('/geo-sort', planningController.geoSort);
router.patch('/routes/:routeId/color', planningController.setRouteColor);
router.patch('/routes/:routeId/driver-name', planningController.setDriverName);
router.post('/routes/:routeId/add-round', planningController.addRound);

export default router;
