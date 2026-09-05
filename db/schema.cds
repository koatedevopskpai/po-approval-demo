namespace po.approval;

using { cuid, managed } from '@sap/cds/common';

/**
 * Purchase order approval workflow demo.
 * Core entities: Vendors, PurchaseOrders (header), PurchaseOrderItems.
 */
type PurchaseOrderStatus : String enum {
  Draft            @label: 'Draft';
  Submitted        @label: 'Submitted';
  PendingApproval  @label: 'Pending Approval';
  Approved         @label: 'Approved';
  Rejected         @label: 'Rejected';
  IntegrationError @label: 'Integration Error';
}

entity Vendors : cuid, managed {
  name      : String(80)  @title: 'Vendor Name';
  vatNumber : String(20);
  email     : String(120);
  country   : String(3)   @title: 'Country';
}

entity PurchaseOrders : cuid, managed {
  purchaseOrderNo  : String(20)        @title: 'PO Number';
  vendor           : Association to Vendors;
  description      : String(255)       @title: 'Description';
  totalAmount      : Decimal(15, 2)    @title: 'Total Amount';
  currency         : String(5)          @title: 'Currency';
  status           : PurchaseOrderStatus @title: 'Status';
  workflowId       : String(100)       @title: 'Workflow ID';
  errorMessage     : String(255)       @title: 'Error Message';
  rejectionReason  : String(255)       @title: 'Rejection Reason';
  approvalDate     : DateTime          @title: 'Approval Date';
  approvedBy       : String(64)        @title: 'Approved By';
  items            : Composition of many PurchaseOrderItems on items.parent = $self;
}

entity PurchaseOrderItems : cuid {
  parent   : Association to PurchaseOrders;
  product  : String(80)     @title: 'Product';
  quantity : Decimal(13, 3) @title: 'Quantity';
  unit     : String(3)      @title: 'Unit';
  price    : Decimal(15, 2) @title: 'Price';
}