import type {
  AboutContent,
  ContactContent,
  FaqContent,
  GlobalContent,
  HomepageContent,
  LoginContent,
  PropertiesContent,
  RegisterContent,
} from '../schemas/cms.js';

/**
 * Seed-safe CMS data — 8 documents that mirror the public static content
 * (`apps/web/src/features/public/content/*` + `features/auth/content.ts`).
 *
 * This module is **environment-agnostic**: no `import.meta.env`, no `window`,
 * no `localStorage`, no `fetch`, no `Supabase` client. It is safe to import
 * from Node (`tsx supabase/seed.ts`) and from the browser (`cmsRepository.ts`).
 *
 * The literals are the single source of truth for CMS seeds. Both
 * `apps/admin/src/features/cms/services/cmsRepository.ts` and
 * `supabase/seed.ts` must consume from here — do not duplicate.
 */

export const CMS_HOMEPAGE_SEED: HomepageContent = {
  hero: {
    eyebrow: 'JA&D Realty Services',
    title: 'Where Big Dreams Meet Property That Already Earns',
    lead: 'A licensed independent brokerage specializing in titled, income-oriented property opportunities. We connect buyers and sellers, verify every document, and make sure every step of the process is complete and correct.',
    primaryCta: { label: 'Explore Properties', to: '/properties' },
    secondaryCta: { label: 'Discover JA&D', to: '/about' },
    image: {
      id: 'photo-1600585154340-be6161a56a0c',
      alt: 'A modern residence with warm interior lighting at dusk',
    },
  },
  value: {
    eyebrow: 'The JA&D difference',
    title: 'Good value for money — handled with diligence.',
    paragraphs: [
      'We find property that already works: titled units and lots with clean documents and, where possible, a tenant already in place under a live lease. The new owner becomes the landlord and collects rent directly under the existing lease — we never pool funds or manage money.',
      'From first conversation to closing, our role is advisory. We bridge sellers and buyers, verify the paperwork, and stay with you until every document and step is complete and correct.',
    ],
    image: {
      id: 'photo-1600607687939-ce8a6c25118c',
      alt: 'A bright, open luxury interior with floor-to-ceiling windows',
    },
  },
  categories: {
    eyebrow: 'What we specialize in',
    title: 'A portfolio built around how you live and invest.',
    lead: 'Explore the types of properties we specialize in.',
  },
  featured: {
    eyebrow: 'What we represent',
    title: 'A glimpse of what we bring to the table.',
    lead: 'The types of property we specialize in — each opportunity is presented individually, with full documentation.',
    cta: { label: 'View Property Categories', to: '/properties' },
  },
  approach: {
    eyebrow: 'The brokerage approach',
    title: 'From first conversation to closing — transparent at every step.',
    steps: [
      {
        title: 'Understand your goal',
        body: 'We listen first — whether you are buying, selling, or exploring what income-oriented property can mean for you.',
      },
      {
        title: 'Present the right opportunity',
        body: 'We match you with titled, documented property opportunities suited to your goal and budget.',
      },
      {
        title: 'Verify every document',
        body: 'Due diligence comes first. Titles, leases, and legal documents are reviewed so nothing is left to chance.',
      },
      {
        title: 'Close with confidence',
        body: 'We coordinate the transfer so the buyer receives complete, correct documents — and ownership begins properly.',
      },
      {
        title: 'Support beyond closing',
        body: 'As a brokerage, we do not manage money or pool funds. You own the property and its income directly; we remain available for guidance.',
      },
    ],
  },
  trust: {
    eyebrow: 'Built on integrity',
    title: 'A brokerage you can hold accountable.',
    items: [
      {
        title: 'Property ownership, directly',
        body: 'You hold the title in your name. We never pool funds, manage money, or promise returns.',
      },
      {
        title: 'Due diligence first',
        body: 'Titles and lease documents are reviewed carefully before any opportunity is presented.',
      },
      {
        title: 'Complete documentation',
        body: 'Every transaction is supported by complete, correct documents — verified and explained to you.',
      },
      {
        title: 'Honest, professional advice',
        body: 'We help you understand what a property is and is not — so you can decide with confidence.',
      },
    ],
  },
  aboutPreview: {
    eyebrow: 'About JA&D',
    title: 'Diligence in every letter of our name.',
    lead: 'Judicious Advisory & Diligence. Journey of Achievable & Dependable. Just Aspirations & Dreams. The way we work is the meaning of our name.',
    image: {
      id: 'photo-1522708323590-d24dbb6b0267',
      alt: 'A thoughtfully furnished apartment living room',
    },
    cta: { label: 'Discover JA&D', to: '/about' },
  },
  ctaBand: {
    title: 'Ready to explore what property can do for you?',
    lead: 'Have a property opportunity or looking for the right property? Talk with JA&D Realty Services — we will guide you through every step.',
    primaryCta: { label: 'Talk to Us', to: '/contact' },
    secondaryCta: { label: 'Read the FAQs', to: '/faqs' },
  },
};

export const CMS_ABOUT_SEED: AboutContent = {
  hero: {
    eyebrow: 'About',
    title: 'About JA&D Realty Services',
    lead: 'A licensed independent brokerage built on diligence, dependable value, and the belief that property can serve bigger dreams.',
    primaryCta: { label: 'Explore Properties', to: '/properties' },
    image: {
      id: 'photo-1512917774080-9991f1c4c750',
      alt: 'A modern home exterior with warm lighting at dusk',
    },
  },
  intro: {
    eyebrow: 'Who we are',
    title: 'Property that already works.',
    label: { title: 'An independent brokerage', body: 'Guiding buyers and sellers at every step.' },
    paragraphs: [
      'JA&D Realty Services is a real-estate brokerage that specializes in titled, income-oriented property opportunities. Our niche is straightforward: we find property that already works — titled units and lots with clean documents and, where possible, a tenant already in place under a live lease.',
      'We bridge sellers and buyers with good value for money in mind, and we guide both sides through every document and step until the transfer is complete and correct. As a brokerage, we do not pool funds, manage money, or promise returns — you own the title, and the property works for you directly.',
    ],
    image: { id: 'photo-1497366754035-f200968a6e72', alt: 'A calm, light-filled office space' },
  },
  philosophy: {
    eyebrow: 'The JA&D philosophy',
    title: 'Three readings of our name.',
    lead: 'Three readings of our name shape how we work every day.',
    items: [
      {
        title: 'Judicious Advisory & Diligence',
        body: 'We advise carefully and verify thoroughly. Every title and lease document is reviewed so decisions are made on facts, not promises.',
      },
      {
        title: 'Journey of Achievable & Dependable',
        body: 'We keep the path to property ownership realistic and dependable — clear steps, complete paperwork, and honest guidance along the way.',
      },
      {
        title: 'Just Aspirations & Dreams',
        body: 'Behind every property is a plan for a better life. We treat those plans with respect and work to make them achievable.',
      },
    ],
  },
  approach: {
    eyebrow: 'Our approach',
    title: 'Due diligence is non-negotiable.',
    lead: 'Our work begins with understanding what you are looking for — as a buyer, a seller, or someone simply exploring what income-oriented property can offer. We then present opportunities that fit: titled property with documented leases and clear ownership.',
    points: [
      {
        title: 'Due diligence first',
        body: 'Titles are checked, leases are reviewed, and every claim is verified before a property is presented.',
      },
      {
        title: 'Complete documentation',
        body: 'We coordinate the transfer so the documents you receive are complete, correct, and in order.',
      },
      {
        title: 'Clear boundaries',
        body: 'You own the title and collect the rent directly under the existing lease — we never pool funds or manage money.',
      },
    ],
    image: { id: 'photo-1450101499163-c8848c66ca85', alt: 'A hand reviewing documents at a desk' },
  },
  vision: {
    eyebrow: 'Vision',
    statement:
      'To be the brokerage that Filipinos — at home and abroad — trust for titled, income-oriented property, where every transaction is documented, every claim is verified, and every client makes an informed decision.',
  },
  mission: {
    eyebrow: 'Mission',
    title: 'Our mission',
    lead: 'To connect buyers and sellers with good-value, titled property opportunities — serving local and overseas Filipino clients with professional brokerage, rigorous due diligence, and complete transparency at every step.',
    points: [
      {
        title: 'Connect buyers and sellers',
        body: 'Good-value, titled property opportunities — you own the title, and the property works for you directly.',
      },
      {
        title: 'Serve clients at home and abroad',
        body: 'Professional brokerage for local and overseas Filipino clients, from first conversation to closing.',
      },
      {
        title: 'Rigorous due diligence',
        body: 'Rigorous due diligence and complete transparency at every step, with every claim verified before it is presented.',
      },
    ],
  },
  cta: {
    title: 'See how the approach works',
    lead: 'Explore the property categories we specialize in, or talk with us about what you are looking for.',
    primaryCta: { label: 'Explore Properties', to: '/properties' },
    secondaryCta: { label: 'Talk to Us', to: '/contact' },
  },
};

export const CMS_PROPERTIES_SEED: PropertiesContent = {
  categories: [
    {
      slug: 'tenanted-condo-resales',
      title: 'Tenanted Condo Resales',
      shortDescription:
        'Resale condominium units and houses with tenants and existing lease contracts already in place.',
      description:
        'Individual resale of condominium units with tenants and existing lease contracts.',
      image: { id: 'photo-1460317442991-0ec209397118', alt: 'A modern condominium tower' },
      isFeatured: true,
    },
    {
      slug: 'income-generating-properties',
      title: 'Income Generating Properties',
      shortDescription:
        'Titled hotspring lots in Laguna with a long-term lease already in place — ownership that earns from day one.',
      description:
        'Individual resale of a titled lot in Laguna with the long-term lease already in place. Title and ownership lead; the rent is stated as a fact of the existing lease, never a promise.',
      image: { id: 'photo-1506905925346-21bda4d32df4', alt: 'A scenic leisure property landscape' },
      isFeatured: false,
    },
    {
      slug: 'developer-project-brokerage',
      title: 'Developer Project Brokerage',
      shortDescription:
        'Accredited broker for licensed developer projects, connecting clients to vetted project opportunities.',
      description:
        'Accredited broker for licensed developer projects — e.g., Mountain View Leisure Community, Nasugbu (LTS No. 0001950).',
      image: { id: 'photo-1486406146926-c627a92ad1ab', alt: 'A contemporary development building' },
      isFeatured: false,
    },
  ],
  properties: [
    {
      id: 'igp-250-sqm-farm-lot',
      name: '250 SQM Farm Lot with Hotspring',
      categoryId: 'income-generating-properties',
      location: 'Laguna',
      price: '1200000.00',
      keyFacts: [
        { label: 'Lot area', value: '250 m²' },
        { label: 'Available lots', value: '2 (250 m² each)' },
        { label: 'Price', value: '₱1.2M negotiable' },
      ],
      characteristics: ['250 m²', 'Hotspring', '2 lots available'],
      overview: [
        'Own a 250 sqm farm lot with natural hot spring access. Start earning rental income from day one with this income-generating property.',
        'Secure your investment today and enjoy the benefits of owning a hot spring property.',
      ],
      highlights: [
        '2 available lots (250 sqm each)',
        'Price: ₱1.2M negotiable',
        'Natural hot spring property',
        'Earn rental income from day 1',
        'Clean title – ready for transfer under your name',
      ],
      gallery: [
        { id: 'photo-1500530855697-b586d89ba3ee', alt: 'A green landscape with open grassland' },
        {
          id: 'photo-1500382017468-9049fed747ef',
          alt: 'A wide open field of land under a bright sky',
        },
      ],
      isFeatured: true,
    },
    {
      id: 'igp-titled-hotspring-lots',
      name: 'Titled Hotspring Lots',
      categoryId: 'income-generating-properties',
      location: 'Laguna',
      price: '2000000.00',
      keyFacts: [
        { label: 'Lot area', value: '520 m² – 3 lots available' },
        { label: 'Lot area', value: '500 m² – 2 lots available' },
        { label: 'Price', value: '₱2M–₱2.5M' },
      ],
      characteristics: ['520 m²', '500 m²', 'Tenanted'],
      overview: [
        'Own a prime hot spring property with existing tenants and enjoy rental income from day one.',
        'Secure your investment today — message us now for more details or to schedule a site viewing.',
      ],
      highlights: [
        '520 sqm – 3 lots available',
        '500 sqm – 2 lots available',
        'Price: ₱2M–₱2.5M',
        'Titled & ready for transfer',
        'Currently tenanted – immediate rental income',
      ],
      gallery: [
        {
          id: 'photo-1470071459604-3b5ec3a7fe05',
          alt: 'Rolling green hills in soft morning light',
        },
        { id: 'photo-1500530855697-b586d89ba3ee', alt: 'A green landscape with open grassland' },
      ],
      isFeatured: false,
    },
    {
      id: 'igp-1000-sqm-hotspring-lot',
      name: '1,000 SQM Hotspring Lot',
      categoryId: 'income-generating-properties',
      location: 'Laguna',
      price: '4000000.00',
      keyFacts: [
        { label: 'Lot area', value: '1,000 m²' },
        { label: 'Available lots', value: '4' },
        { label: 'Price', value: '₱4,000,000 only' },
      ],
      characteristics: ['1,000 m²', '4 lots', 'Hotspring', 'Direct owner resale'],
      overview: [
        'Own a 1,000 sqm titled hot spring lot with an existing tenant, providing immediate rental income from day one.',
        'Don’t miss this rare investment opportunity — only 4 lots available. Message us today for complete details or to schedule a site viewing.',
      ],
      highlights: [
        '1,000 sqm lot area (4 lots available)',
        'Price: ₱4,000,000 only',
        'Clean title – ready for transfer',
        'Currently tenanted – earn monthly rental income',
        'Genuine hotspring property',
        'Individual titled lot',
        'Direct owner resale',
      ],
      gallery: [
        {
          id: 'photo-1500382017468-9049fed747ef',
          alt: 'A wide open field of land under a bright sky',
        },
        {
          id: 'photo-1470071459604-3b5ec3a7fe05',
          alt: 'Rolling green hills in soft morning light',
        },
      ],
      isFeatured: false,
    },
    {
      id: 'prisma-celeste-8-6m',
      name: 'Prisma Residences – Celeste Building Condo',
      categoryId: 'tenanted-condo-resales',
      location: 'Pasig City',
      price: '8600000.00',
      keyFacts: [
        { label: 'Bedrooms', value: '2' },
        { label: 'Floor area', value: '56 m²' },
        { label: 'Price', value: 'From ₱8.6 million' },
        { label: 'Lease', value: 'Tenanted – active lease contract' },
      ],
      characteristics: ['2 bd', '56 m²', 'RFO', 'With tenant'],
      overview: [
        '2-bedroom condominium unit at Prisma Residences – Celeste Building, ready for occupancy (RFO) with an existing tenant and active lease contract — an income-generating unit.',
        'Ideal for investors or end-users looking for a premium property in a prime location.',
      ],
      highlights: [
        'Ready for occupancy (RFO)',
        '56 sqm floor area',
        '2 bedrooms',
        'With balcony and city view',
        'With existing tenant and active lease contract (income-generating unit)',
        'Ideal for investors or end-users looking for a premium property in a prime location',
      ],
      gallery: [
        { id: 'photo-1460317442991-0ec209397118', alt: 'A modern condominium tower' },
        {
          id: 'photo-1582407947304-fd86f028f716',
          alt: 'A contemporary apartment building exterior',
        },
      ],
      isFeatured: false,
    },
    {
      id: 'levina-place-2br',
      name: 'Levina Place – 2BR Condo',
      categoryId: 'tenanted-condo-resales',
      location: 'Pasig City',
      price: '5500000.00',
      keyFacts: [
        { label: 'Bedrooms', value: '2' },
        { label: 'Bathrooms', value: '1' },
        { label: 'Price', value: 'From ₱5.5 million' },
        { label: 'Lease', value: 'Tenanted – active lease contract' },
      ],
      characteristics: ['2 bd', '1 ba', 'RFO', 'With tenant'],
      overview: [
        '2-bedroom condominium unit at Levina Place, ready for occupancy (RFO) with an existing tenant and active lease contract.',
        'Direct owner sale with clean title — ideal for investors seeking passive income or end-users looking for a prime property in a convenient location.',
      ],
      highlights: [
        'Ready for occupancy (RFO)',
        'Spacious 2-bedroom layout',
        '2 bedrooms',
        '1 bathroom',
        'With roofdeck drying area',
        'With existing tenant and active lease contract (income-generating unit)',
        'Direct owner sale with clean title',
        'Ideal for investors seeking passive income or end-users looking for a prime property in a convenient location',
      ],
      gallery: [
        { id: 'photo-1600210492486-724fe5c67fb0', alt: 'A modern apartment living space' },
        {
          id: 'photo-1560448204-e02f11c3d0e2',
          alt: 'A bright apartment interior with modern finishes',
        },
      ],
      isFeatured: false,
    },
    {
      id: 'prisma-celeste-8-3m',
      name: 'Prisma Residences – Celeste Building Condo',
      categoryId: 'tenanted-condo-resales',
      location: 'Pasig City',
      price: '8300000.00',
      keyFacts: [
        { label: 'Bedrooms', value: '2' },
        { label: 'Floor area', value: '56 m²' },
        { label: 'Price', value: 'From ₱8.3 million' },
        { label: 'Lease', value: 'Tenanted – active lease contract' },
      ],
      characteristics: ['2 bd', '56 m²', 'RFO', 'With tenant'],
      overview: [
        '2-bedroom condominium unit at Prisma Residences – Celeste Building, ready for occupancy (RFO) with an existing tenant and active lease contract.',
        'Located in the prestigious Prisma Residences by DMCI Homes.',
      ],
      highlights: [
        'Ready for occupancy (RFO)',
        '56 sqm floor area',
        '2 bedrooms',
        'With balcony and stunning city view',
        'With existing tenant and active lease contract (income-generating unit)',
        'Located in the prestigious Prisma Residences by DMCI Homes',
      ],
      gallery: [
        {
          id: 'photo-1600607687939-ce8a6c25118c',
          alt: 'A bright, open luxury interior with floor-to-ceiling windows',
        },
        { id: 'photo-1600210492486-724fe5c67fb0', alt: 'A modern apartment living space' },
        { id: 'photo-1556912167-f556f1f39fdf', alt: 'A modern kitchen with fitted cabinetry' },
      ],
      isFeatured: false,
    },
    {
      id: 'prisma-astra-1br',
      name: 'Prisma Residences – Astra Building Condo',
      categoryId: 'tenanted-condo-resales',
      location: 'Pasig City',
      price: '5300000.00',
      keyFacts: [
        { label: 'Bedrooms', value: '1' },
        { label: 'Floor area', value: '28 m²' },
        { label: 'Parking', value: 'N/A' },
        { label: 'Price', value: 'From ₱5.3 million' },
        { label: 'Lease', value: 'Tenanted – active lease contract' },
      ],
      characteristics: ['1 bd', '28 m²', 'RFO', 'With tenant'],
      overview: [
        '1-bedroom condominium unit at Prisma Residences – Astra Building, ready for occupancy (RFO) with an existing tenant and active lease contract.',
        'Located in the vibrant Prisma Residences community by DMCI Homes.',
      ],
      highlights: [
        'Ready for occupancy (RFO)',
        '28 sqm floor area',
        '1 bedroom',
        'Parking: N/A',
        'With existing tenant and active lease contract (income-generating unit)',
        'Located in the vibrant Prisma Residences community by DMCI Homes',
      ],
      gallery: [
        {
          id: 'photo-1522708323590-d24dbb6b0267',
          alt: 'A thoughtfully furnished apartment living room',
        },
        {
          id: 'photo-1560448204-e02f11c3d0e2',
          alt: 'A bright apartment interior with modern finishes',
        },
      ],
      isFeatured: false,
    },
    {
      id: '2-storey-house-sucat',
      name: '2-Storey House',
      categoryId: 'tenanted-condo-resales',
      location: 'Sucat, Parañaque',
      price: '3200000.00',
      keyFacts: [
        { label: 'Bedrooms', value: '2 (upstairs and downstairs)' },
        { label: 'Lot area', value: '25 m²' },
        { label: 'Floor area', value: '38 m²' },
        { label: 'Price', value: 'From ₱3.2 million' },
        { label: 'Lease', value: 'Tenanted – active lease contract' },
      ],
      characteristics: ['2-storey', '2 bd', '25 m² lot', 'With tenant'],
      overview: [
        '2-storey inner unit house and lot in Sucat, Parañaque, ready for occupancy (RFO) with an existing tenant and active lease contract.',
        'Ideal for investors seeking rental income or families looking for an affordable starter home.',
      ],
      highlights: [
        'Ready for occupancy (RFO)',
        'Lot area: 25 sqm',
        'Floor area: 38 sqm',
        '2 bedrooms (upstairs and downstairs)',
        'Inner unit facing east',
        'With existing tenant and active lease contract (income-generating property)',
        'Ideal for investors seeking rental income or families looking for an affordable starter home',
      ],
      gallery: [
        { id: 'photo-1568605114967-8130f3a36994', alt: 'A suburban family house exterior' },
        {
          id: 'photo-1600585154340-be6161a56a0c',
          alt: 'A modern residence with warm interior lighting at dusk',
        },
        { id: 'photo-1512917774080-9991f1c4c750', alt: 'A two-storey home exterior at dusk' },
      ],
      isFeatured: false,
    },
    {
      id: 'mountain-view-leisure-community',
      name: 'Mountain View Leisure Community',
      categoryId: 'developer-project-brokerage',
      location: 'Nasugbu, Batangas',
      keyFacts: [
        { label: 'Price', value: 'Starting at ₱6,860/sqm' },
        { label: 'Payment terms', value: 'Up to 7 years to pay' },
        { label: 'LTS No.', value: '0001950' },
        { label: 'TLS No.', value: '108 & 109' },
        { label: 'COR', value: '0003812 & 0003813' },
        { label: 'Availability', value: 'Limited lots available' },
      ],
      characteristics: ['₱6,860/sqm', '7 years to pay', 'LTS No. 0001950'],
      overview: [
        'Invest in serenity — own a prime elevated property in Nasugbu at Mountain View Leisure Community. Lots start at ₱6,860/sqm, with up to 7 years to pay.',
        'Your investment is secure and protected: LTS No. 0001950, TLS No. 108 & 109, COR 0003812 & 0003813. Message us for full details — limited lots available — or schedule a site viewing.',
      ],
      highlights: [
        'Prime elevated property in Nasugbu',
        'Starting at ₱6,860/sqm',
        'Up to 7 years to pay',
        'Limited lots available',
        'LTS No. 0001950 | TLS No. 108 & 109',
        'COR 0003812 & 0003813',
        'Phase 1 West, Phase 1 East & Phase 2 East',
      ],
      gallery: [
        {
          id: 'photo-1454496522488-7a8e488e8606',
          alt: 'A dramatic mountain landscape under clear skies',
        },
        { id: 'photo-1506905925346-21bda4d32df4', alt: 'A scenic leisure property landscape' },
        { id: 'photo-1470770841072-f978cf4d019e', alt: 'A mountain lake beneath a clear sky' },
        { id: 'photo-1519681393784-d120267933ba', alt: 'A mountain ridge under a starry dusk sky' },
      ],
      isFeatured: false,
    },
    {
      id: 'mountain-suites',
      name: 'Mountain Suites',
      categoryId: 'developer-project-brokerage',
      location: 'Nasugbu, Batangas',
      keyFacts: [
        { label: 'Price', value: 'Starting at ₱6,860/sqm' },
        { label: 'LTS No.', value: '0001950' },
        { label: 'TLS No.', value: '108 & 109' },
        { label: 'Availability', value: 'Limited lots available' },
      ],
      characteristics: ['₱6,860/sqm', 'LTS No. 0001950'],
      overview: [
        'Own a prime elevated property in Nasugbu at Mountain Suites — part of Mountain View Leisure Farm and Resort.',
        'Where prime living meets breathtaking views. Message us for full details — limited lots available.',
      ],
      highlights: [
        'Part of Mountain View Leisure Farm and Resort',
        'Prime elevated property in Nasugbu',
        'Starting at ₱6,860/sqm',
        'LTS No. 0001950 | TLS No. 108 & 109',
        'Limited lots available',
      ],
      gallery: [
        {
          id: 'photo-1566073771259-6a8506099945',
          alt: 'A resort pool with lounge chairs and palm trees',
        },
        {
          id: 'photo-1584132967334-10e028bd69f7',
          alt: 'A modern resort suite with a private terrace',
        },
      ],
      isFeatured: false,
    },
  ],
  page: {
    eyebrow: 'Properties',
    title: 'Properties & Listings',
    lead: 'Explore the types of properties we specialize in. Every opportunity is presented individually, with full documentation and due diligence — talk with us about what you are looking for.',
    hero: {
      eyebrow: 'Properties',
      image: {
        id: 'photo-1570129477492-45c003edd2be',
        alt: 'A classic family home exterior under a clear sky',
      },
      primaryCta: { label: 'Talk to Us', to: '/contact' },
    },
    intro: {
      eyebrow: 'Browse by category',
      title: 'What we specialize in',
      lead: 'Pick a category to explore our current listings — every opportunity is presented individually, with complete documentation.',
    },
    featured: {
      eyebrow: 'Featured listings',
      title: 'A glimpse of what we bring to the table',
      lead: 'A look at what we offer. Every opportunity is presented individually, with complete documentation.',
    },
    note: {
      eyebrow: 'Presented individually',
      title: 'Browse by what you want to achieve',
      lead: 'Tell us what you are looking for, and we will bring you the opportunities that fit.',
      steps: [
        {
          title: 'Every opportunity, presented individually',
          body: 'Each property is presented with full documentation and due diligence — one opportunity at a time.',
        },
        {
          title: 'Documents reviewed, details explained',
          body: 'Every listing is shown with its documents reviewed and its details explained.',
        },
        {
          title: 'Message us for a site viewing',
          body: 'Message us now for more details or to schedule a site viewing.',
        },
      ],
    },
    cta: {
      title: 'Looking for a specific kind of property?',
      lead: 'Talk with JA&D Realty Services and tell us what you are looking for — we will match you with the right opportunity.',
      primaryCta: { label: 'Talk to Us', to: '/contact' },
    },
  },
};

export const CMS_FAQS_SEED: FaqContent = {
  eyebrow: 'FAQs',
  title: 'Frequently asked questions',
  hero: {
    eyebrow: 'FAQs',
    lead: 'Concise, plain-language answers to the questions buyers and sellers ask us most — before you talk to us.',
    image: {
      id: 'photo-1486406146926-c627a92ad1ab',
      alt: 'A contemporary development building',
    },
    primaryCta: { label: 'Talk to Us', to: '/contact' },
  },
  intro: {
    eyebrow: 'Quick answers',
    statement: 'Questions answered clearly.',
    body: 'A short reference for the questions people ask us most often. Each answer stays close to how we actually work as a brokerage — no projections, no promises. If you do not see yours here, ask us directly.',
  },
  cta: {
    title: 'Still have questions?',
    lead: 'We are happy to walk you through how it works — reach us on Messenger or through the contact page.',
    primaryCta: { label: "Let's Talk", href: 'https://m.me/JADRealtyServices' },
    secondaryCta: { label: 'Contact Us', to: '/contact' },
  },
  items: [
    {
      question: 'What does JA&D Realty Services specialize in?',
      answer:
        'We are a real-estate brokerage specializing in titled, income-oriented property opportunities — most notably tenanted condominium resales, income-generating properties with leases already in place, and brokerage for licensed developer projects. Our focus is good value for money, backed by due diligence and complete documentation.',
    },
    {
      question: 'What is a tenanted property?',
      answer:
        'A tenanted property is a titled unit or lot that already has a paying tenant under a live lease. When you buy it, you become the landlord and collect the rent directly under the existing lease — you own the title in your name from the start.',
    },
    {
      question: 'How does the brokerage process work?',
      answer:
        'It starts with understanding your goal. We present opportunities that fit, verify the title and lease documents through due diligence, then guide you through the transfer so that every document and step is complete and correct. We are a brokerage — we do not pool funds or manage money; you own the property directly.',
    },
    {
      question: 'What does due diligence mean?',
      answer:
        'Due diligence means we verify before we recommend. Titles are checked for clean ownership, lease contracts are reviewed, and every claim about a property is confirmed against its documents before it is presented to you.',
    },
    {
      question: 'Who can work with JA&D?',
      answer:
        'Buyers and sellers of property — including Filipino clients at home and overseas — can work with us. Tell us what you are looking for, or what you have, and we will guide you through the process.',
    },
    {
      question: 'Does JA&D guarantee investment returns?',
      answer:
        'No. As a brokerage, we do not manage money, pool funds, or promise returns. We present documented, titled property opportunities and make sure every step is complete and correct — the property itself, and its existing lease, are what work for you.',
    },
  ],
};

export const CMS_CONTACT_SEED: ContactContent = {
  title: 'Talk with JA&D Realty Services',
  hero: {
    eyebrow: 'Contact',
    image: {
      id: 'photo-1613490493576-7fde63acd811',
      alt: 'A contemporary villa exterior at golden hour',
    },
    primaryCta: { label: 'Explore Properties', to: '/properties' },
  },
  methods: [
    {
      label: 'Messenger',
      value: 'Message Us on Messenger',
      icon: 'messenger',
      href: 'https://m.me/JADRealtyServices',
      external: true,
      featured: true,
    },
    {
      label: 'Phone',
      value: '0965-250-0052',
      icon: 'phone',
      href: 'tel:+639652500052',
      external: true,
      featured: false,
    },
    {
      label: 'Email',
      value: 'info.jaandd@gmail.com',
      icon: 'email',
      href: 'mailto:info.jaandd@gmail.com',
      external: true,
      featured: false,
    },
    {
      label: 'Office address',
      value:
        'Alaminos Commercial Complex, Unit 103–104, Maharlika Road, Brgy. San Juan, Alaminos, Laguna',
      icon: 'location',
      external: false,
      featured: false,
    },
  ],
  form: {
    heading: 'Send us a message',
    note: 'Tell us what you are looking for — we will get back to you with the next steps.',
    submitLabel: 'Send Message',
  },
  cta: {
    title: 'Prefer to explore on your own first?',
    lead: 'Browse the property categories and common questions — then reach out when you are ready.',
    primaryCta: { label: 'Explore Properties', to: '/properties' },
    secondaryCta: { label: 'Read the FAQs', to: '/faqs' },
  },
  detailsHeading: 'Reach us directly',
  details: [
    {
      label: 'Office address',
      value:
        'Alaminos Commercial Complex, Unit 103–104, Maharlika Road, Brgy. San Juan, Alaminos, Laguna',
    },
    { label: 'Email', value: 'info.jaandd@gmail.com' },
    { label: 'Phone', value: '0965-250-0052' },
  ],
};

export const CMS_GLOBAL_SEED: GlobalContent = {
  brand: {
    name: 'JA&D Realty Services',
    shortName: 'JA&D',
    tagline: 'A real-estate brokerage built on diligence, documentation, and dependable value.',
    positioningLine: 'Where Big Dreams Meet Property That Already Earns',
  },
  logo: { id: '/ja-d-logo.png', alt: 'JA&D Realty Services' },
  brandMark: { id: '/ja-d-auth-logo.png', alt: 'JA&D Realty Services (white)' },
  browserIcon: { id: '/ja-d-favicon.png', alt: 'JA&D Realty Services favicon' },
  nav: [
    { label: 'Home', to: '/' },
    { label: 'About Us', to: '/about' },
    { label: 'Properties', to: '/properties' },
    { label: 'FAQs', to: '/faqs' },
    { label: 'Contact', to: '/contact' },
  ],
  authNav: [
    { label: 'Login', to: '/login' },
    { label: 'Register', to: '/register' },
  ],
  footer: {
    brandLine:
      'A licensed independent real-estate brokerage connecting buyers and sellers with titled, income-oriented property opportunities.',
    exploreHeading: 'Explore',
    contactHeading: 'Reach us directly',
    contacts: [
      {
        label: 'Office address',
        value:
          'Alaminos Commercial Complex, Unit 103–104, Maharlika Road, Brgy. San Juan, Alaminos, Laguna',
      },
      { label: 'Email', value: 'info.jaandd@gmail.com' },
      { label: 'Phone', value: '0965-250-0052' },
    ],
    bottomBar: { legalSuffix: 'All rights reserved.', showTagline: true },
  },
  messenger: {
    url: 'https://m.me/JADRealtyServices',
    label: "Let's Talk",
    ariaLabel: 'Message JA&D Realty Services on Messenger',
    hideOnAuth: true,
  },
  seo: {
    title: 'JA&D Realty Services — Where Big Dreams Meet Property That Already Earns',
    description:
      'JA&D Realty Services — a licensed independent real-estate brokerage specializing in titled, income-oriented property opportunities. Where Big Dreams Meet Property That Already Earns.',
    theme: {
      primary: '#2c6aa7',
      secondary: '#3477b8',
      accent: '#a9853a',
      accentLight: '#dac56a',
      brandDeep: '#142b47',
    },
    pages: {},
  },
};

export const CMS_LOGIN_SEED: LoginContent = {
  image: {
    id: 'photo-1613490493576-7fde63acd811',
    alt: 'A contemporary villa exterior at golden hour',
  },
  copy: {
    eyebrow: 'Member login',
    title: 'Welcome back',
    lead: 'Access your JA&D member account.',
    brandTitle: 'Where Big Dreams meet property that already earns',
    brandLead:
      'Sign in to manage your membership, property interests, and account details — in one secure place.',
  },
  fields: {
    identifier: {
      label: 'Email or phone number',
      hint: 'Use the email address or phone number you registered with.',
    },
    password: { label: 'Password' },
  },
  submitLabel: 'Sign In',
  forgotPassword: { label: 'Forgot password?' },
  registerPrompt: {
    text: "Don't have a JA&D account yet?",
    linkLabel: 'Create your account',
  },
};

export const CMS_REGISTER_SEED: RegisterContent = {
  image: {
    id: 'photo-1560448204-e02f11c3d0e2',
    alt: 'A bright apartment interior with modern finishes',
  },
  copy: {
    eyebrow: 'Member registration',
    title: 'Join JA&D',
    lead: 'Create your member account and begin your journey with JA&D.',
    brandTitle: 'Begin your journey with JA&D',
    brandLead:
      'Membership has no purchase requirement. Registration is free and open — approval follows verification and review.',
  },
  stepTitles: {
    programProfile: 'Program & profile',
    qualification: 'Qualification',
    referral: 'Referral code',
    governmentId: 'Government ID',
    account: 'Account',
  },
  fields: {
    programId: { label: 'Program', hint: 'Choose the program you are applying under.' },
    firstName: { label: 'First name' },
    middleInitial: { label: 'Middle initial', hint: 'One letter, optional.' },
    lastName: { label: 'Last name' },
    nameSuffix: { label: 'Name suffix', hint: 'Optional, e.g. Jr., Sr., III.' },
    dateOfBirth: { label: 'Date of birth', hint: 'Format: YYYY-MM-DD.' },
    gender: { label: 'Gender' },
    countryCode: { label: 'Country' },
    address: { label: 'Address', hint: 'Optional.' },
    phone: { label: 'Phone number' },
    email: { label: 'Email address' },
    password: { label: 'Password', hint: 'At least 8 characters.' },
    confirmPassword: { label: 'Confirm password' },
    referralCode: {
      label: 'Sponsor / referral code',
      hint: 'Optional — leave blank if you were not referred by a member. The code is validated against active members.',
    },
    idDocument: { label: 'Government ID', hint: 'Attach a clear copy. Only metadata is captured.' },
    consent: { label: 'I agree to the JA&D member terms and privacy policy.' },
  },
  qualification: {
    domestic: [
      {
        id: 'qual-dom-1',
        question: 'Are you at least 18 years old and able to enter into a binding contract?',
      },
      {
        id: 'qual-dom-2',
        question:
          'Do you understand this is a real estate brokerage and not a guaranteed investment or profit-sharing scheme?',
      },
    ],
    abroad: [
      {
        id: 'qual-ab-1',
        question:
          'Are you at least 18 years old and legally able to enter into a contract in your country?',
      },
      {
        id: 'qual-ab-2',
        question:
          'Do you understand this is a real estate brokerage and not a guaranteed investment or profit-sharing scheme?',
      },
    ],
  },
  submitLabel: 'Create My Account',
  loginPrompt: {
    text: 'Already have a JA&D account?',
    linkLabel: 'Sign in',
  },
  verifyEmail: {
    eyebrow: 'Verify your email',
    title: 'Check your email',
    lead: 'We sent a one-time verification code to your email address.',
    brandTitle: 'Verification keeps your account secure',
    brandLead:
      'Confirm that the email address belongs to you. JA&D reviews your application after your email is verified.',
  },
  status: {
    eyebrow: 'Application received',
    title: 'Application received',
    brandTitle: 'You’re one step closer',
    brandLead:
      'Your application is being reviewed. There is no purchase requirement and no cost to apply.',
    lead: 'Your application is being reviewed.',
  },
};

export const CMS_SEEDS: Record<string, unknown> = {
  homepage: CMS_HOMEPAGE_SEED,
  about: CMS_ABOUT_SEED,
  properties: CMS_PROPERTIES_SEED,
  faqs: CMS_FAQS_SEED,
  contact: CMS_CONTACT_SEED,
  global: CMS_GLOBAL_SEED,
  login: CMS_LOGIN_SEED,
  register: CMS_REGISTER_SEED,
};
