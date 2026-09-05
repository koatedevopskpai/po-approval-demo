process.env.CPI_MOCK_DELAY_MS = '0';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const cds = require('@sap/cds');

let url;

const VENDOR = 'a1f0c1b2-0001-4000-8000-000000000001';
const jsonHeaders = { 'Content-Type': 'application/json' };

const j = (r) => r.json();
const get = (path) => fetch(url + path).then(j);
const post = async (path, body = {}) => {
  const res = await fetch(url + path, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : undefined };
};

before(async () => {
  ({ url } = await cds.exec('all', '--in-memory', '--port', '0'));
});

after(async () => {
  await cds.shutdown();
});

test('service is exposed at /odata/v4/purchase-order', async () => {
  const res = await fetch(url + '/odata/v4/purchase-order/$metadata');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /PurchaseOrders/);
});

test('seed data is loaded: 3 vendors, 4 purchase orders', async () => {
  const vendors = await get('/odata/v4/purchase-order/Vendors');
  assert.equal(vendors.value.length, 3);
  const pos = await get('/odata/v4/purchase-order/PurchaseOrders');
  assert.equal(pos.value.length, 4);
});

test('creating a PO auto-submits it to the approval workflow (automation)', async () => {
  const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
    description: 'Automation test PO',
    totalAmount: 1234.5,
    currency: 'GBP',
    vendor_ID: VENDOR,
  });
  assert.equal(created.status, 201);
  const row = created.data;
  assert.ok(row.ID);
  assert.match(row.purchaseOrderNo, /^PO-\d{4}$/);
  assert.equal(row.status, 'PendingApproval');
  assert.match(row.workflowId, /^wf-/);
});

test('approve action completes the approval', async () => {
  const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
    description: 'To be approved', totalAmount: 10, currency: 'EUR', vendor_ID: VENDOR,
  });
  const id = created.data.ID;
  assert.equal(created.data.status, 'PendingApproval');

  const res = await post(`/odata/v4/purchase-order/PurchaseOrders('${id}')/PurchaseOrderService.approve`);
  assert.equal(res.status, 204);
  const after = await get(`/odata/v4/purchase-order/PurchaseOrders('${id}')`);
  assert.equal(after.status, 'Approved');
  assert.ok(after.approvalDate);
  assert.equal(after.approvedBy, 'anonymous');
});

test('reject action records the reason', async () => {
  const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
    description: 'To be rejected', totalAmount: 20, currency: 'USD', vendor_ID: VENDOR,
  });
  const id = created.data.ID;

  const res = await post(`/odata/v4/purchase-order/PurchaseOrders('${id}')/PurchaseOrderService.rejectRequest`, {
    reason: 'Budget exceeded',
  });
  assert.equal(res.status, 204);
  const after = await get(`/odata/v4/purchase-order/PurchaseOrders('${id}')`);
  assert.equal(after.status, 'Rejected');
  assert.equal(after.rejectionReason, 'Budget exceeded');
});

test('invalid workflow transitions are rejected (403)', async () => {
  const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
    description: 'Transition guard', totalAmount: 30, currency: 'GBP', vendor_ID: VENDOR,
  });
  const id = created.data.ID;
  assert.equal(created.data.status, 'PendingApproval');

  // cannot submit an already-submitted PO
  const res = await post(`/odata/v4/purchase-order/PurchaseOrders('${id}')/PurchaseOrderService.submit`);
  assert.equal(res.status, 403);

  // cannot approve a rejected PO
  await post(`/odata/v4/purchase-order/PurchaseOrders('${id}')/PurchaseOrderService.rejectRequest`, { reason: 'nope' });
  const res2 = await post(`/odata/v4/purchase-order/PurchaseOrders('${id}')/PurchaseOrderService.approve`);
  assert.equal(res2.status, 403);
});

test('integration failures set IntegrationError, retry recovers', async () => {
  process.env.CPI_MOCK_FAIL = 'true';
  try {
    const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
      description: 'Failure test', totalAmount: 40, currency: 'GBP', vendor_ID: VENDOR,
    });
    assert.equal(created.data.status, 'IntegrationError');
    assert.ok(created.data.errorMessage);

    const created2 = await post('/odata/v4/purchase-order/PurchaseOrders', {
      description: 'Recovery test', totalAmount: 50, currency: 'GBP', vendor_ID: VENDOR,
    });
    const id2 = created2.data.ID;
    assert.equal(created2.data.status, 'IntegrationError');

    delete process.env.CPI_MOCK_FAIL;

    const retry = await post(`/odata/v4/purchase-order/PurchaseOrders('${id2}')/PurchaseOrderService.retry`);
    assert.equal(retry.status, 204);
    const after = await get(`/odata/v4/purchase-order/PurchaseOrders('${id2}')`);
    assert.equal(after.status, 'PendingApproval');
    assert.ok(after.workflowId);
  } finally {
    delete process.env.CPI_MOCK_FAIL;
  }
});

test('deep create persists line items', async () => {
  const created = await post('/odata/v4/purchase-order/PurchaseOrders', {
    description: 'PO with items',
    currency: 'GBP',
    vendor_ID: VENDOR,
    items: [
      { product: 'Laptop', quantity: 2, unit: 'PCS', price: 999.5 },
      { product: 'Docking station', quantity: 1, unit: 'PCS', price: 129.0 },
    ],
  });
  const id = created.data.ID;
  assert.equal(created.status, 201);

  const items = await get(`/odata/v4/purchase-order/PurchaseOrders('${id}')/items`);
  assert.equal(items.value.length, 2);
  const products = items.value.map((i) => i.product).sort();
  assert.deepEqual(products, ['Docking station', 'Laptop']);
});

test('Fiori Elements app is served', async () => {
  const res = await fetch(url + '/purchase-orders/webapp/index.html');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /sap-ui-core/);
});