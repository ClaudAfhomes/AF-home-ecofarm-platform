import type { Program, QualificationQuestion } from '../schemas/program.js';
import type { Policy as PolicyType } from '../schemas/policy.js';

/**
 * Reference-data seeds — single source for `supabase/seed.ts` AND the
 * parity specs that lock mock stores to seeded values (Phase B1).
 * Values mirror the long-standing mock fixtures verbatim; do not edit copy
 * here without updating the affected UI specs.
 */
export const PROGRAM_SEEDS: Program[] = [
  {
    id: 'prg-domestic',
    code: 'DOMESTIC',
    name: 'Domestic Program',
    description:
      'For members based in the Philippines. Covers local property transactions and domestic referral networks.',
  },
  {
    id: 'prg-abroad',
    code: 'ABROAD',
    name: 'Abroad Program',
    description:
      'For Overseas Filipino Workers (OFW) and international members. Covers foreign property listings and cross-border referrals.',
  },
];

export const PROGRAM_QUESTION_SEEDS: { programId: string; questions: QualificationQuestion[] }[] = [
  {
    programId: 'prg-domestic',
    questions: [
      {
        id: 'qual-dom-1',
        questionText: 'Are you at least 18 years old and able to enter into a binding contract?',
      },
      {
        id: 'qual-dom-2',
        questionText:
          'Do you understand this is a real estate brokerage and not a guaranteed investment or profit-sharing scheme?',
      },
    ],
  },
  {
    programId: 'prg-abroad',
    questions: [
      {
        id: 'qual-ab-1',
        questionText:
          'Are you at least 18 years old and legally able to enter into a contract in your country?',
      },
      {
        id: 'qual-ab-2',
        questionText:
          'Do you understand this is a real estate brokerage and not a guaranteed investment or profit-sharing scheme?',
      },
    ],
  },
];

export type ConfigSeed = { key: string; label: string; value: string; category: string };

/** Mirrors admin MOCK_CONFIG plus the public GENDERS row. */
export const CONFIG_SEEDS: ConfigSeed[] = [
  {
    key: 'COMMISSION_DIRECT_RATE',
    label: 'Direct Commission Rate',
    value: '0.0800',
    category: 'Commissions',
  },
  {
    key: 'COMMISSION_REFERRAL_RATE',
    label: 'Direct Referral Rate',
    value: '0.0400',
    category: 'Commissions',
  },
  {
    key: 'COMMISSION_CLEARING_DAYS',
    label: 'Commission Clearing Window (days)',
    value: '7',
    category: 'Commissions',
  },
  {
    key: 'MIN_WITHDRAWAL_AMOUNT',
    label: 'Minimum Withdrawal Amount',
    value: '100.00',
    category: 'Withdrawals',
  },
  {
    key: 'MAX_WITHDRAWAL_AMOUNT',
    label: 'Maximum Withdrawal Amount',
    value: '50000.00',
    category: 'Withdrawals',
  },
  {
    key: 'QUALIFICATION_MIN_SALES',
    label: 'Minimum Qualifying Sales',
    value: '1',
    category: 'Qualification',
  },
  {
    key: 'QUALIFICATION_MIN_AGE',
    label: 'Minimum Member Age',
    value: '18',
    category: 'Qualification',
  },
  {
    key: 'MAX_RESUBMISSION_ATTEMPTS',
    label: 'Max Sale Resubmission Attempts',
    value: '3',
    category: 'Sales',
  },
  {
    key: 'VOUCHER_DEFAULT_EXPIRY_DAYS',
    label: 'Voucher Expiry (days)',
    value: '90',
    category: 'Vouchers',
  },
  {
    key: 'GENDERS',
    label: 'Gender Options',
    value: '["Male","Female","Others"]',
    category: 'Registration',
  },
];

export const POLICY_SEEDS: (PolicyType & { content: string })[] = [
  {
    id: 'pol-001',
    title: 'Terms and Conditions',
    type: 'terms',
    content:
      'By registering for JA&D membership you agree to abide by the JA&D terms and conditions as published on the official website. Membership has no purchase requirement.\n\n' +
      '1. Acceptance of Terms\n' +
      'These terms govern your access to and use of the JA&D membership platform, including sales recording, referrals, commissions, and related services. By completing registration and verifying your email, you confirm that you are at least 18 years old, that the information you provide is accurate, and that you accept these terms in full. If you do not agree, please do not proceed with registration.\n\n' +
      '2. Member Obligations\n' +
      'Members must provide accurate personal information, maintain the confidentiality of their account credentials, and comply with all applicable laws and JA&D program guidelines. Qualifying sales must be recorded accurately against catalog properties, and referral relationships are strictly single-level — only the direct referrer is recognized for referral purposes.\n\n' +
      '3. No Purchase Requirement and Contact\n' +
      'Membership does not require the purchase of any product or property. All fees, commissions, and incentives are described in the official program guidelines. For questions about these terms, contact support@jad.example or refer to the official JA&D website.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
  {
    id: 'pol-002',
    title: 'Program Guidelines',
    type: 'guidelines',
    content:
      'These guidelines describe how qualifying sales and referrals work within the JA&D membership program.\n\n' +
      '1. Recording Qualifying Sales\n' +
      'Members who are Active and Qualified may record qualifying sales against catalog properties through the platform. Each sale must include a verified customer record and a valid property selection. Sales are reviewed by JA&D Admin and may be approved, rejected, or locked after repeated resubmissions. Only sales that reach payment verification are considered qualifying.\n\n' +
      '2. Referral Relationships\n' +
      'Members may refer new members using their personal referral code. Referral relationships are strictly single-level (direct referrer only) and are used for reporting purposes such as Direct Referrals, Group Network, and Genealogy views. Referral relationships never imply multi-level commission entitlement.\n\n' +
      '3. Qualification and Compliance\n' +
      'Members must meet the qualification checklist, including email verification, ID verification, and admin approval. Members are expected to follow the program guidelines, handle customer information responsibly, and use marketing materials only as provided through the official content library.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
  {
    id: 'pol-003',
    title: 'Privacy Policy',
    type: 'privacy',
    content:
      'JA&D collects only the personal information needed to operate the membership platform. Personal data is never sold. Full details are published on the official website.\n\n' +
      '1. Information We Collect\n' +
      'We collect registration details such as name, date of birth, contact information, country, and program selection, as well as information you provide when recording sales and referrals. We also collect limited usage information necessary to operate and secure the platform.\n\n' +
      '2. How We Use Information\n' +
      'We use your information to verify your identity, evaluate your application, manage your membership, process qualifying sales and commissions, and provide member services such as eWallet, payouts, and support. We do not sell your personal information to third parties.\n\n' +
      '3. Retention and Your Choices\n' +
      'We retain information only as long as necessary for the purposes described above and as required by law. You may request access to or correction of your information by contacting support@jad.example. For the complete policy, please visit the official JA&D website.',
    updatedAt: '2026-08-18T10:00:00.000Z',
  },
];
