import { Router, type IRouter } from "express";
import healthRouter from "./health";
import autovisitorRouter from "./autovisitor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(autovisitorRouter);

export default router;
