import { Router } from "express";
import { postEcho } from "./echo.controller.ts";
import { validateEchoBody } from "./echo.validator.ts";

const router = Router();

router.post("/", validateEchoBody, postEcho);

export { router as echoRouter };