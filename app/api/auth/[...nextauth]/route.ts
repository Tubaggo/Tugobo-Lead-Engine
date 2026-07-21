import { handlers } from "@/auth";

/**
 * Auth.js endpoint. This is the only public /api surface besides /api/health,
 * and it is excluded from the session guard by design.
 */
export const { GET, POST } = handlers;
