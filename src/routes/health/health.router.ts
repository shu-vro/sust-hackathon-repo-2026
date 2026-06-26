import { Router } from "express";
import { getHealth } from "./health.controller.ts";

const router = Router();

router.get("/", getHealth);

export { router as healthRouter };