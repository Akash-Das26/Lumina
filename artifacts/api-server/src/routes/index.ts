import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(openaiRouter);

export default router;
