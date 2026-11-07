// Manual check: npx tsx scripts/audit-address.ts <0x address>
// Prints the AuditResult (or the error / timeout object) for a live Sepolia address.
import "dotenv/config";
import { auditAddress, auditTimeoutFromEnv, readerFromEnv } from "../src/auditor/chain.js";
import { decide } from "../src/gate/decide.js";

const address = process.argv[2];
if (!address) {
  console.error("usage: npx tsx scripts/audit-address.ts <0x address>");
  process.exit(1);
}
const result = await auditAddress(address, readerFromEnv(process.env), auditTimeoutFromEnv(process.env));
console.log(JSON.stringify(result, null, 2));
console.log("gate:", decide(result));
