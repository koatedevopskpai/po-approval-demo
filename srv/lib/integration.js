/**
 * Integration with SAP Integration Suite (Cloud Integration / CPI).
 *
 * The service calls an integration flow (iFlow) deployed in SAP Integration Suite
 * which kicks off the approval workflow and answers with a workflowId.
 *
 * Configuration (see README "CPI trial setup"):
 *  - Real CPI:   provide credentials via `.cdsrc-private.json` (gitignored)
 *                or the env vars CPI_API_URL / CPI_API_PATH / CPI_USER / CPI_PASSWORD.
 *  - Mock mode:  if no endpoint is configured the call is simulated so the
 *                whole demo runs offline and in the reviewer's sandbox.
 *
 * Contract with the iFlow:
 *  POST <endpoint>  { purchaseOrderId, purchaseOrderNo, vendor, totalAmount,
 *                     currency, description }
 *  -> 200 { workflowId: "<id>" }
 */
const cds = require('@sap/cds');

const MOCK_DELAY_MS = Number(process.env.CPI_MOCK_DELAY_MS ?? 400);

async function submitToApproval(po) {
  const cfg = cds.env.requires?.['API_CPI'] ?? {};
  const realUrl = cfg.credentials?.url || process.env.CPI_API_URL;

  if (realUrl) {
    return callReal(po, cfg);
  }
  return callMock();
}

async function callReal(po, cfg) {
  // Merge config from .cdsrc-private.json with env-var overrides, so the same
  // code path works locally and on Cloud Foundry (cf set-env).
  const credentials = {
    ...cfg.credentials,
    url: cfg.credentials?.url || process.env.CPI_API_URL,
    username: cfg.credentials?.username || process.env.CPI_USER,
    password: cfg.credentials?.password || process.env.CPI_PASSWORD,
  };
  const path = cfg.credentials?.path || process.env.CPI_API_PATH || '/http/poapproval';
  try {
    const service = await cds.connect.to({ kind: 'rest', credentials });
    const result = await service.send({
      method: 'POST',
      path,
      data: {
        purchaseOrderId: po.ID,
        purchaseOrderNo: po.purchaseOrderNo,
        vendor: po.vendor_ID,
        totalAmount: po.totalAmount,
        currency: po.currency,
        description: po.description,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    const workflowId = result?.workflowId;
    if (!workflowId) {
      return { ok: false, error: 'CPI answered without a workflowId' };
    }
    return { ok: true, workflowId, mode: 'cpi' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function callMock() {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  if (process.env.CPI_MOCK_FAIL === 'true') {
    return { ok: false, error: 'Simulated CPI failure (CPI_MOCK_FAIL=true)' };
  }
  return { ok: true, workflowId: `wf-${cds.utils.uuid()}`, mode: 'mock' };
}

module.exports = { submitToApproval };