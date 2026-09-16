import type { ForwardableContent } from '@jad/contracts';

/**
 * Canonical marketing content seed — shared between admin and member apps.
 * Admin list shows all 12 (paginated); member gallery shows all 12 (filterable).
 * Every item is a production-like, owner-ready asset. No promos (owned by
 * Notifications), no internal docs, no dev placeholders.
 * All share/download URLs are external links or realistic mock links per BR-MKT-002.
 */
export const MOCK_MARKETING_CONTENT: ForwardableContent[] = [
  {
    id: 'ctn-001',
    title: 'JA&D Membership Overview',
    description: 'A one-page overview of the JA&D membership opportunity.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'JA&D Membership Overview\n\nJA&D offers a membership opportunity built on property-focused income-generating products.\n\nVisit the JA&D website for the full program details.',
      ),
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/membership-overview',
      viberUrl: 'https://www.viber.com/forward?text=Check%20out%20JA%26D%20membership',
      copyUrl: 'https://jad.example/membership-overview',
    },
    createdAt: '2026-08-10T09:00:00.000Z',
  },
  {
    id: 'ctn-002',
    title: 'How Qualifying Sales Work',
    description: 'A short explainer on qualifying sales and commission basics.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'How Qualifying Sales Work\n\nA qualifying sale is a sale recorded through the JA&D platform against a catalog property. Commissions are explained in the official program guidelines.',
      ),
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/qualifying-sales',
      viberUrl: 'https://www.viber.com/forward?text=Learn%20about%20JA%26D%20qualifying%20sales',
      copyUrl: 'https://jad.example/qualifying-sales',
    },
    createdAt: '2026-08-09T08:30:00.000Z',
  },
  {
    id: 'ctn-003',
    title: 'JA&D Project Showcase',
    description: 'High-resolution image showcase for your social posts and presentations.',
    kind: 'IMAGE',
    downloadUrl:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=450&fit=crop&auto=format',
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/project-showcase',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Project%20Showcase',
      copyUrl: 'https://jad.example/project-showcase',
    },
    createdAt: '2026-08-08T10:15:00.000Z',
  },
  {
    id: 'ctn-004',
    title: 'JA&D Property Lineup',
    description: 'Gallery of JA&D featured properties for social sharing.',
    kind: 'IMAGE',
    downloadUrl:
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=450&fit=crop&auto=format',
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/property-lineup',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Property%20Lineup',
      copyUrl: 'https://jad.example/property-lineup',
    },
    createdAt: '2026-08-07T14:00:00.000Z',
  },
  {
    id: 'ctn-005',
    title: 'JA&D Opportunity Video',
    description: 'Short video explainer you can forward to prospects.',
    kind: 'VIDEO',
    downloadUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/opportunity-video',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Opportunity%20Video',
      copyUrl: 'https://jad.example/opportunity-video',
    },
    createdAt: '2026-08-06T11:00:00.000Z',
  },
  {
    id: 'ctn-006',
    title: 'Virtual Office Tour',
    description: '360-degree virtual tour of the JA&D office for member introductions.',
    kind: 'VIDEO',
    downloadUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    share: {
      messengerUrl: 'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/virtual-tour',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Virtual%20Office%20Tour',
      copyUrl: 'https://jad.example/virtual-tour',
    },
    createdAt: '2026-08-05T09:30:00.000Z',
  },
  {
    id: 'ctn-007',
    title: 'JA&D Program Brochure',
    description: 'Printable PDF brochure with program highlights and FAQs.',
    kind: 'DOCUMENT',
    downloadUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/program-brochure',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Program%20Brochure',
      copyUrl: 'https://jad.example/program-brochure',
    },
    createdAt: '2026-08-04T15:00:00.000Z',
  },
  {
    id: 'ctn-008',
    title: 'Buyer Guide Checklist',
    description: 'Step-by-step checklist for first-time property buyers.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'Buyer Guide Checklist\n\n1. Determine your budget\n2. Choose a property from the JA&D catalog\n3. Record your sale on the platform\n4. Complete verification with admin\n5. Proceed to payment',
      ),
    share: {
      messengerUrl: 'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/buyer-guide',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Buyer%20Guide%20Checklist',
      copyUrl: 'https://jad.example/buyer-guide',
    },
    createdAt: '2026-08-03T08:00:00.000Z',
  },
  {
    id: 'ctn-009',
    title: 'Community Open House Flyer',
    description: 'Ready-to-share flyer for your next community open house event.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'JA&D Community Open House\n\nJoin us for an exclusive community open house event.\n\nDate: Every Saturday\nTime: 10:00 AM\nVenue: JA&D Showroom\n\nBring a friend and discover property opportunities together.',
      ),
    share: {
      messengerUrl: 'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/open-house',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Open%20House%20Flyer',
      copyUrl: 'https://jad.example/open-house',
    },
    createdAt: '2026-08-02T12:00:00.000Z',
  },
  {
    id: 'ctn-010',
    title: 'Unit Turnover Checklist',
    description: 'Document your unit turnover steps with this ready-to-use checklist.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'Unit Turnover Checklist\n\n1. Receive turnover notice\n2. Schedule unit inspection\n3. Verify unit condition against standards\n4. Complete turnover documentation\n5. Hand over keys and access credentials',
      ),
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/turnover-checklist',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Unit%20Turnover%20Checklist',
      copyUrl: 'https://jad.example/turnover-checklist',
    },
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'ctn-011',
    title: 'JA&D Social Starter Kit',
    description: 'Sample social media captions and image pairings you can copy and share.',
    kind: 'DOCUMENT',
    downloadUrl:
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent(
        'JA&D Social Starter Kit\n\nPost 1: Explore property opportunities with JA&D Realty. Visit jad.realty to learn more.\nPost 2: Your next investment starts here. Ask me about JA&D membership.\nPost 3: JA&D helps you connect people with properties. Share this with someone who is looking.',
      ),
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/social-starter-kit',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Social%20Starter%20Kit',
      copyUrl: 'https://jad.example/social-starter-kit',
    },
    createdAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'ctn-012',
    title: 'Member Welcome Video',
    description: 'Short welcome clip you can send to newly approved members.',
    kind: 'VIDEO',
    downloadUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    share: {
      messengerUrl:
        'https://www.facebook.com/sharer/sharer.php?u=https://jad.example/welcome-video',
      viberUrl: 'https://www.viber.com/forward?text=JA%26D%20Member%20Welcome%20Video',
      copyUrl: 'https://jad.example/welcome-video',
    },
    createdAt: '2026-07-30T14:30:00.000Z',
  },
];
