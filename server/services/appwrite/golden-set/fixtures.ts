import { GoldenSetDocument } from './types';

export const GOLDEN_SET_DOCUMENTS: GoldenSetDocument[] = [
  {
    id: 'gs-001',
    name: 'Bank Statement - Chase - January 2024',
    description: 'Monthly bank statement with multiple transactions',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'bank_statement',
    expectedExtraction: {
      dates: [
        { field: 'statement_date', value: '2024-01-31', format: 'YYYY-MM-DD' },
        { field: 'statement_period_start', value: '2024-01-01', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'ending_balance', value: 15432.67, currency: 'USD' },
        { field: 'beginning_balance', value: 12500.00, currency: 'USD' },
      ],
      entities: [
        { field: 'institution', name: 'Chase Bank', type: 'organization' },
        { field: 'account_holder', name: 'John Smith', type: 'person' },
      ],
    },
    shouldAutoFinalize: true,
    tags: ['financial', 'bank', 'monthly'],
  },
  {
    id: 'gs-002',
    name: 'Pay Stub - Acme Corp - Week 12',
    description: 'Weekly pay stub with deductions',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'pay_stub',
    expectedExtraction: {
      dates: [
        { field: 'pay_date', value: '2024-03-22', format: 'YYYY-MM-DD' },
        { field: 'pay_period_end', value: '2024-03-21', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'gross_pay', value: 3500.00, currency: 'USD' },
        { field: 'net_pay', value: 2650.00, currency: 'USD' },
        { field: 'federal_tax', value: 450.00, currency: 'USD' },
      ],
      entities: [
        { field: 'employer', name: 'Acme Corporation', type: 'organization' },
        { field: 'employee', name: 'Jane Doe', type: 'person' },
      ],
    },
    shouldAutoFinalize: true,
    tags: ['financial', 'income', 'employment'],
  },
  {
    id: 'gs-003',
    name: 'Receipt - Target - Groceries',
    description: 'Retail receipt with line items',
    fileType: 'image',
    mimeType: 'image/jpeg',
    category: 'receipt',
    expectedExtraction: {
      dates: [
        { field: 'transaction_date', value: '2024-02-15', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'total', value: 87.43, currency: 'USD' },
        { field: 'subtotal', value: 82.50, currency: 'USD' },
        { field: 'tax', value: 4.93, currency: 'USD' },
      ],
      entities: [
        { field: 'vendor', name: 'Target', type: 'vendor' },
      ],
      lineItems: [
        { description: 'Organic Milk', amount: 6.99, quantity: 2 },
        { description: 'Bread', amount: 4.50, quantity: 1 },
        { description: 'Eggs', amount: 5.99, quantity: 1 },
      ],
    },
    shouldAutoFinalize: true,
    tags: ['expense', 'retail', 'groceries'],
  },
  {
    id: 'gs-004',
    name: 'Court Order - Child Support',
    description: 'Family court order for child support payments',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'court_order',
    expectedExtraction: {
      dates: [
        { field: 'order_date', value: '2023-06-15', format: 'YYYY-MM-DD' },
        { field: 'effective_date', value: '2023-07-01', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'monthly_support', value: 1500.00, currency: 'USD' },
      ],
      entities: [
        { field: 'court', name: 'Superior Court of California', type: 'organization' },
        { field: 'petitioner', name: 'Sarah Johnson', type: 'person' },
        { field: 'respondent', name: 'Michael Johnson', type: 'person' },
      ],
      documentType: 'child_support_order',
      documentNumber: 'FL-2023-00456',
    },
    shouldAutoFinalize: false,
    tags: ['legal', 'court', 'child-support'],
  },
  {
    id: 'gs-005',
    name: 'Tax Return - 1040 - 2023',
    description: 'Federal income tax return',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'tax_return',
    expectedExtraction: {
      dates: [
        { field: 'tax_year', value: '2023-12-31', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'adjusted_gross_income', value: 85000.00, currency: 'USD' },
        { field: 'total_tax', value: 12500.00, currency: 'USD' },
        { field: 'refund_amount', value: 2340.00, currency: 'USD' },
      ],
      entities: [
        { field: 'taxpayer', name: 'Robert Williams', type: 'person' },
      ],
      documentType: 'form_1040',
    },
    shouldAutoFinalize: true,
    tags: ['financial', 'tax', 'federal'],
  },
  {
    id: 'gs-006',
    name: 'Invoice - Attorney Fees',
    description: 'Legal services invoice',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'invoice',
    expectedExtraction: {
      dates: [
        { field: 'invoice_date', value: '2024-01-10', format: 'YYYY-MM-DD' },
        { field: 'due_date', value: '2024-02-10', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'total_due', value: 5250.00, currency: 'USD' },
      ],
      entities: [
        { field: 'vendor', name: 'Smith & Associates Law Firm', type: 'organization' },
        { field: 'client', name: 'Emily Chen', type: 'person' },
      ],
      lineItems: [
        { description: 'Legal consultation (5 hrs)', amount: 1500.00 },
        { description: 'Document preparation', amount: 750.00 },
        { description: 'Court filing fees', amount: 500.00 },
        { description: 'Research and analysis (10 hrs)', amount: 2500.00 },
      ],
      documentNumber: 'INV-2024-0042',
    },
    shouldAutoFinalize: true,
    tags: ['expense', 'legal', 'attorney'],
  },
  {
    id: 'gs-007',
    name: 'Property Deed - 123 Main St',
    description: 'Real estate property deed',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'property_deed',
    expectedExtraction: {
      dates: [
        { field: 'recording_date', value: '2020-08-15', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'purchase_price', value: 450000.00, currency: 'USD' },
      ],
      entities: [
        { field: 'grantor', name: 'Previous Owner LLC', type: 'organization' },
        { field: 'grantee', name: 'John and Jane Smith', type: 'person' },
      ],
      documentNumber: '2020-0815-001234',
    },
    shouldAutoFinalize: false,
    tags: ['property', 'real-estate', 'asset'],
  },
  {
    id: 'gs-008',
    name: 'Credit Card Statement - Visa',
    description: 'Monthly credit card statement',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'credit_card_statement',
    expectedExtraction: {
      dates: [
        { field: 'statement_date', value: '2024-02-28', format: 'YYYY-MM-DD' },
        { field: 'payment_due_date', value: '2024-03-25', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'statement_balance', value: 3456.78, currency: 'USD' },
        { field: 'minimum_payment', value: 75.00, currency: 'USD' },
        { field: 'previous_balance', value: 2100.00, currency: 'USD' },
      ],
      entities: [
        { field: 'issuer', name: 'Chase Visa', type: 'organization' },
        { field: 'cardholder', name: 'Maria Garcia', type: 'person' },
      ],
    },
    shouldAutoFinalize: true,
    tags: ['financial', 'credit', 'debt'],
  },
  {
    id: 'gs-009',
    name: 'Medical Bill - Hospital',
    description: 'Hospital medical bill',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'medical_bill',
    expectedExtraction: {
      dates: [
        { field: 'service_date', value: '2024-01-05', format: 'YYYY-MM-DD' },
        { field: 'bill_date', value: '2024-01-20', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'total_charges', value: 2500.00, currency: 'USD' },
        { field: 'insurance_adjustment', value: 1800.00, currency: 'USD' },
        { field: 'patient_responsibility', value: 700.00, currency: 'USD' },
      ],
      entities: [
        { field: 'provider', name: 'City General Hospital', type: 'organization' },
        { field: 'patient', name: 'David Brown', type: 'person' },
      ],
    },
    shouldAutoFinalize: true,
    tags: ['medical', 'expense', 'healthcare'],
  },
  {
    id: 'gs-010',
    name: 'W-2 Form - 2023',
    description: 'Annual wage and tax statement',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'w2',
    expectedExtraction: {
      dates: [
        { field: 'tax_year', value: '2023-12-31', format: 'YYYY-MM-DD' },
      ],
      amounts: [
        { field: 'wages_tips_other', value: 75000.00, currency: 'USD' },
        { field: 'federal_income_tax_withheld', value: 11250.00, currency: 'USD' },
        { field: 'social_security_wages', value: 75000.00, currency: 'USD' },
        { field: 'medicare_wages', value: 75000.00, currency: 'USD' },
      ],
      entities: [
        { field: 'employer', name: 'Tech Solutions Inc', type: 'organization' },
        { field: 'employee', name: 'Alex Thompson', type: 'person' },
      ],
      documentType: 'form_w2',
    },
    shouldAutoFinalize: true,
    tags: ['tax', 'income', 'employment'],
  },
];

export function getGoldenSetById(id: string): GoldenSetDocument | undefined {
  return GOLDEN_SET_DOCUMENTS.find(doc => doc.id === id);
}

export function getGoldenSetByCategory(category: string): GoldenSetDocument[] {
  return GOLDEN_SET_DOCUMENTS.filter(doc => doc.category === category);
}

export function getGoldenSetByTags(tags: string[]): GoldenSetDocument[] {
  return GOLDEN_SET_DOCUMENTS.filter(doc => 
    tags.some(tag => doc.tags.includes(tag))
  );
}
