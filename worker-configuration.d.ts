import { Env as HonoEnv } from "hono"

export interface Env extends HonoEnv {
	Bindings: {
		DB: D1Database;
	}
}
