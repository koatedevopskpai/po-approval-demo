using { po } from '../db/schema';

service PurchaseOrderService @(path: '/odata/v4/purchase-order') {

  @readonly
  entity Vendors as projection on po.approval.Vendors;

  entity PurchaseOrderItems as projection on po.approval.PurchaseOrderItems;

  entity PurchaseOrders as projection on po.approval.PurchaseOrders {
    key ID,
    purchaseOrderNo,
    vendor,
    description,
    totalAmount,
    currency,
    status,
    workflowId,
    errorMessage,
    rejectionReason,
    approvalDate,
    approvedBy,
    createdAt,
    items
  } actions {
    action submit       ();
    action retry        ();
    action approve      ();
    action rejectRequest(reason : String(255));
  };

  annotate PurchaseOrders with @(
    UI.HeaderInfo : {
      TypeName       : 'Purchase Order',
      TypeNamePlural : 'Purchase Orders',
      Title          : { Value : purchaseOrderNo },
      Description    : { Value : vendor.name }
    },
    UI.SelectionFields : [ purchaseOrderNo, vendor.name, status, currency ],
    UI.LineItem : [
      { Value : purchaseOrderNo, Label : 'PO Number' },
      { Value : vendor.name,     Label : 'Vendor' },
      { Value : totalAmount,     Label : 'Total Amount' },
      { Value : currency,        Label : 'Currency' },
      { Value : status,          Label : 'Status' },
      { Value : createdAt,       Label : 'Created At' }
    ],
    UI.Facets : [
      { $Type : 'UI.ReferenceFacet', Target : '@UI.FieldGroup#General',    Label : 'General' },
      { $Type : 'UI.ReferenceFacet', Target : '@UI.FieldGroup#Approval',   Label : 'Approval Workflow' },
      { $Type : 'UI.ReferenceFacet', Target : 'items/@UI.FieldGroup#Items', Label : 'Items' }
    ],
    UI.FieldGroup #General : {
      Data : [
        { Value : purchaseOrderNo },
        { Value : vendor.name },
        { Value : description },
        { Value : totalAmount },
        { Value : currency },
        { Value : status }
      ]
    },
    UI.FieldGroup #Approval : {
      Data : [
        { Value : workflowId,       Label : 'Workflow ID (from SAP Integration Suite)' },
        { Value : errorMessage,     Label : 'Last integration error' },
        { Value : rejectionReason,  Label : 'Rejection reason' },
        { Value : approvalDate,     Label : 'Decision date' },
        { Value : approvedBy,       Label : 'Decision by' }
      ]
    }
  );

  annotate PurchaseOrders {
    status           @Common.FieldControl: #ReadOnly;
    workflowId       @Common.FieldControl: #ReadOnly;
    errorMessage     @Common.FieldControl: #ReadOnly;
    rejectionReason  @Common.FieldControl: #ReadOnly;
    approvalDate     @Common.FieldControl: #ReadOnly;
    approvedBy       @Common.FieldControl: #ReadOnly;
  };

  annotate PurchaseOrderItems with @(
    UI.FieldGroup #Items : {
      Data : [
        { Value : product },
        { Value : quantity },
        { Value : unit },
        { Value : price }
      ]
    }
  );
}