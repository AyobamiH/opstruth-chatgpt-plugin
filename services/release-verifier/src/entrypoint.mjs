import { WorkerEntrypoint } from "cloudflare:workers";
import worker, { evaluateRecovery } from "./worker.mjs";

// Reachable only through an explicitly configured Cloudflare service binding.
// The default public HTTP worker has no recovery route or RPC forwarding path.
export class ReleaseRecovery extends WorkerEntrypoint {
  async verify(body) { return evaluateRecovery(body, this.env); }
}
export default worker;
