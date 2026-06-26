import { Router } from "express";
import { echoRouter } from "./echo/echo.router.ts";

const router = Router();

router.use("/echo", echoRouter);

export { router as v1Router };