import { handleRavioRequest } from "../../cloudflare/worker.mjs";

export const onRequest = ({ request, env }: { request: Request; env: Record<string, string> }) =>
  handleRavioRequest(request, env);
