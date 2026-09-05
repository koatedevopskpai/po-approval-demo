const cds = require('@sap/cds');
const { submitToApproval } = require('./lib/integration');

const log = cds.log('po-approval');

/**
 * Purchase order approval workflow.
 *
 * Reads and writes on the underlying base entity (po.approval.PurchaseOrders)
 * are executed through the database service (cds.db) so that the internal
 * status/approval fields - which are annotated @Common.FieldControl:#ReadOnly
 * for the Fiori UI - stay writable for the workflow logic itself.
 */
class PurchaseOrderService extends cds.ApplicationService {
  init() {
    // --- Automation: create a PO, assign ID / number / status, then
    //     automatically submit it to the external approval workflow
    //     (SAP Integration Suite) in the same transaction ---
    this.on('CREATE', 'PurchaseOrders', async (req) => {
      const data = { ...req.data };

      if (!data.ID) data.ID = cds.utils.uuid();
      if (!data.purchaseOrderNo) {
        const { count } = await cds.db.run(SELECT.one`count(*) as count`.from('po.approval.PurchaseOrders'));
        data.purchaseOrderNo = `PO-${String((count || 0) + 1).padStart(4, '0')}`;
      }
      data.status = 'Draft';

      await cds.db.run(INSERT.into('po.approval.PurchaseOrders').entries(data));
      await this._runSubmission(data);

      return this._result(data.ID);
    });

    // --- Workflow actions (bound; the entity key arrives via req.params) ---
    this.on('submit', async (req) => {
      const po = await this._load(this._key(req));
      this._assertStatus(po, ['Draft', 'IntegrationError']);
      await this._runSubmission(po);
      return this._result(po.ID);
    });

    this.on('retry', async (req) => {
      const po = await this._load(this._key(req));
      this._assertStatus(po, ['IntegrationError']);
      await this._runSubmission(po);
      return this._result(po.ID);
    });

    this.on('approve', async (req) => {
      const po = await this._load(this._key(req));
      this._assertStatus(po, ['PendingApproval']);
      await this._update(po.ID, {
        status: 'Approved',
        approvalDate: new Date().toISOString(),
        approvedBy: req.user?.id || 'system',
      });
      log.info(`PO ${po.purchaseOrderNo} approved by ${req.user?.id || 'system'}`);
      return this._result(po.ID);
    });

    this.on('rejectRequest', async (req) => {
      const po = await this._load(this._key(req));
      this._assertStatus(po, ['PendingApproval']);
      await this._update(po.ID, {
        status: 'Rejected',
        rejectionReason: req.data.reason || 'No reason provided',
        approvalDate: new Date().toISOString(),
        approvedBy: req.user?.id || 'system',
      });
      log.info(`PO ${po.purchaseOrderNo} rejected by ${req.user?.id || 'system'}`);
      return this._result(po.ID);
    });

    return super.init();
  }

  _key(req) {
    // Bound action: entity key arrives in req.params (single-key entity)
    const p = req.params;
    if (Array.isArray(p) && p.length) return typeof p[0] === 'string' ? p[0] : p[0]?.ID;
    return req.data?.ID;
  }

  async _load(ID) {
    const po = await cds.db.run(SELECT.one.from('po.approval.PurchaseOrders').where({ ID }));
    if (!po) throw cds.error(`Purchase order ${ID} not found`, { status: 404 });
    return po;
  }

  async _update(ID, set) {
    return cds.db.run(UPDATE('po.approval.PurchaseOrders').set(set).where({ ID }));
  }

  _assertStatus(po, allowed) {
    if (!allowed.includes(po.status)) {
      throw cds.error(
        `Cannot transition from '${po.status}' to '${allowed.join('/')}'`,
        { status: 403 }
      );
    }
  }

  async _runSubmission(po) {
    await this._update(po.ID, { status: 'Submitted' });

    const outcome = await submitToApproval(po);

    if (outcome.ok) {
      log.info(`PO ${po.purchaseOrderNo} submitted to approval (${outcome.mode}), workflow ${outcome.workflowId}`);
      await this._update(po.ID, {
        status: 'PendingApproval',
        workflowId: outcome.workflowId,
        errorMessage: null,
      });
    } else {
      log.error(`PO ${po.purchaseOrderNo} integration failed: ${outcome.error}`);
      await this._update(po.ID, {
        status: 'IntegrationError',
        errorMessage: outcome.error,
      });
    }
  }

  async _result(ID) {
    return this._load(ID);
  }
}

module.exports = PurchaseOrderService;