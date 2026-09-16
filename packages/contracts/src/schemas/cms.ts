import { z } from 'zod';

/**
 * CMS contracts - frontend-only Phase 1 Homepage CMS.
 * Shapes mirror the public `HOME` content (`apps/web/src/features/public/content/home.ts`)
 * so the initial CMS seed is derived via an adapter, not duplicated. Future
 * `GET/PUT /cms/homepage` will validate against the same schemas.
 */

// CTA - exactly one of internal `to` or external `href`; rejects javascript:/data:
export const cmsCtaLinkSchema = z
  .object({
    label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
    to: z
      .string()
      .min(1)
      .max(200)
      .refine((v) => v.startsWith('/'), 'Internal link must start with /')
      .optional(),
    href: z
      .string()
      .url('Enter a valid https URL')
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === 'https:' || u.protocol === 'http:';
        } catch {
          return false;
        }
      }, 'Only http/https links are allowed')
      .optional(),
  })
  .superRefine((v, ctx) => {
    const hasTo = typeof v.to === 'string' && v.to.length > 0;
    const hasHref = typeof v.href === 'string' && v.href.length > 0;
    if (hasTo === hasHref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of internal link (to) or external link (href)',
        path: hasTo ? ['to'] : ['href'],
      });
    }
    if (v.to && /^(javascript|data|vbscript):/i.test(v.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsafe link', path: ['to'] });
    }
    if (v.href && /^(javascript|data|vbscript):/i.test(v.href)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsafe link', path: ['href'] });
    }
  });

export type CmsCtaLink = z.infer<typeof cmsCtaLinkSchema>;

export const cmsPhotoSchema = z.object({
  // id is a storage key / Unsplash seed / blob URL - allow full URLs up to 500 chars for Supabase Storage or blob previews
  id: z
    .string()
    .min(1, 'Image is required - upload an image')
    .max(500, 'Image reference must be 500 characters or less'),
  alt: z
    .string()
    .min(1, 'Alt text is required')
    .max(120, 'Alt text must be 120 characters or less'),
});

export type CmsPhoto = z.infer<typeof cmsPhotoSchema>;

export const homepageHeroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  primaryCta: cmsCtaLinkSchema,
  secondaryCta: cmsCtaLinkSchema.optional(),
  image: cmsPhotoSchema,
});

export const homepageValueSchema = z.object({
  eyebrow: z.string().min(1).max(60).optional(),
  title: z.string().min(1, 'Title is required').max(80),
  paragraphs: z.array(z.string().min(1).max(600)).min(1).max(3),
  image: cmsPhotoSchema,
});

export const homepageSectionHeaderSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().max(300).optional(),
});

export const homepageFeaturedHeaderSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  cta: cmsCtaLinkSchema,
});

export const homepageApproachSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  steps: z
    .array(
      z.object({
        title: z.string().min(1, 'Title is required').max(60),
        body: z.string().min(1, 'Body is required').max(300),
      }),
    )
    .min(1, 'At least one step is required')
    .max(8, 'At most 8 steps'),
});

export const homepageTrustSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  items: z
    .array(
      z.object({
        title: z.string().min(1, 'Title is required').max(40),
        body: z.string().min(1, 'Body is required').max(300),
      }),
    )
    .min(1, 'At least one pillar is required')
    .max(8, 'At most 8 pillars'),
});

export const homepageAboutPreviewSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  image: cmsPhotoSchema,
  cta: cmsCtaLinkSchema,
});

export const homepageCtaBandSchema = z.object({
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().max(300).optional(),
  primaryCta: cmsCtaLinkSchema,
  secondaryCta: cmsCtaLinkSchema.optional(),
});

/** Full Homepage CMS content - mirrors `HOME` in `apps/web/src/features/public/content/home.ts`. */
export const homepageContentSchema = z.object({
  hero: homepageHeroSchema,
  value: homepageValueSchema,
  categories: homepageSectionHeaderSchema,
  featured: homepageFeaturedHeaderSchema,
  approach: homepageApproachSchema,
  trust: homepageTrustSchema,
  aboutPreview: homepageAboutPreviewSchema,
  ctaBand: homepageCtaBandSchema,
});

export type HomepageContent = z.infer<typeof homepageContentSchema>;

// ---------------------------------------------------------------------------
// About page - mirrors `ABOUT` in `apps/web/src/features/public/content/about.ts`
// 7 sections: hero, intro (Who we are), philosophy (Three readings), approach,
// vision, mission, cta. Reuses cmsPhoto/cmsCta pillar shapes from homepage.
// ---------------------------------------------------------------------------

const cmsPillarSchema = z.object({
  title: z.string().min(1, 'Title is required').max(60),
  body: z.string().min(1, 'Body is required').max(300),
});

export const aboutHeroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  primaryCta: cmsCtaLinkSchema,
  image: cmsPhotoSchema,
});

export const aboutIntroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  label: z.object({
    title: z.string().min(1, 'Label title is required').max(60),
    body: z.string().min(1, 'Label body is required').max(200),
  }),
  paragraphs: z.array(z.string().min(1).max(600)).length(2, 'Intro must have 2 paragraphs'),
  image: cmsPhotoSchema,
});

export const aboutPhilosophySchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  items: z
    .array(cmsPillarSchema)
    .min(1, 'Philosophy must have at least 1 item')
    .max(8, 'Philosophy can have at most 8 items'),
});

export const aboutApproachSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(600),
  points: z
    .array(cmsPillarSchema)
    .min(1, 'Approach must have at least 1 point')
    .max(8, 'Approach can have at most 8 points'),
  image: cmsPhotoSchema,
});

export const aboutVisionSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  statement: z.string().min(1, 'Statement is required').max(300),
});

export const aboutMissionSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(400),
  points: z
    .array(cmsPillarSchema)
    .min(1, 'Mission must have at least 1 point')
    .max(8, 'Mission can have at most 8 points'),
});

export const aboutCtaSchema = z.object({
  title: z.string().min(1, 'Title is required').max(80),
  lead: z.string().min(1, 'Lead is required').max(300),
  primaryCta: cmsCtaLinkSchema,
  secondaryCta: cmsCtaLinkSchema,
});

export const aboutContentSchema = z.object({
  hero: aboutHeroSchema,
  intro: aboutIntroSchema,
  philosophy: aboutPhilosophySchema,
  approach: aboutApproachSchema,
  vision: aboutVisionSchema,
  mission: aboutMissionSchema,
  cta: aboutCtaSchema,
});

export type AboutContent = z.infer<typeof aboutContentSchema>;

// ---------------------------------------------------------------------------
// Properties - mirrors `PROPERTY_CATEGORIES` + `PROPERTY_RECORDS` + `PROPERTIES`
// in `apps/web/src/features/public/content/properties.ts`.
// Audit source: actual public types `PropertyCategory` / `Property` / `Photo`.
// Price remains optional exact-decimal string (not all listings publish a price).
// Featured is derived - first property per category via `getFeaturedProperties`.
// ---------------------------------------------------------------------------

export const cmsPropertyFactSchema = z.object({
  label: z.string().min(1, 'Label is required').max(60, 'Label must be 60 characters or less'),
  value: z.string().min(1, 'Value is required').max(120, 'Value must be 120 characters or less'),
});

export type CmsPropertyFact = z.infer<typeof cmsPropertyFactSchema>;

export const cmsPropertyCategorySchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(60, 'Slug must be 60 characters or less')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1, 'Title is required').max(80, 'Title must be 80 characters or less'),
  shortDescription: z
    .string()
    .min(1, 'Short description is required')
    .max(300, 'Short description must be 300 characters or less'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(600, 'Description must be 600 characters or less'),
  image: cmsPhotoSchema,
  isFeatured: z.boolean().optional().default(false),
  /**
   * Optional link to a catalog category (`PropertyCategory.slug`). The
   * catalog owns identity/counts; CMS owns presentation. Dangling links
   * (catalog item deleted) render as a warning and never block saving.
   */
  catalogSlug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
});

export type CmsPropertyCategory = z.infer<typeof cmsPropertyCategorySchema>;

export const cmsPropertySchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .max(60, 'ID must be 60 characters or less')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  categoryId: z
    .string()
    .min(1, 'Category is required')
    .max(60, 'Category must be 60 characters or less'),
  location: z
    .string()
    .min(1, 'Location is required')
    .max(120, 'Location must be 120 characters or less'),
  price: z.string().max(40, 'Price must be 40 characters or less').optional(),
  keyFacts: z.array(cmsPropertyFactSchema).max(10, 'At most 10 key facts'),
  characteristics: z
    .array(z.string().min(1).max(60, 'Characteristic must be 60 characters or less'))
    .max(15, 'At most 15 characteristics'),
  overview: z
    .array(z.string().min(1).max(600, 'Overview must be 600 characters or less'))
    .max(10, 'At most 10 overview paragraphs'),
  highlights: z
    .array(z.string().min(1).max(300, 'Highlight must be 300 characters or less'))
    .max(15, 'At most 15 highlights'),
  gallery: z
    .array(cmsPhotoSchema)
    .min(1, 'At least one gallery image is required')
    .max(10, 'At most 10 gallery images'),
  isFeatured: z.boolean().optional().default(false),
  /**
   * Optional link to a catalog listing (`Property.id`). The catalog owns
   * identity/price/status; CMS owns presentation. Dangling links (catalog
   * item deleted) render as a warning and never block saving.
   */
  catalogId: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be lowercase alphanumeric with hyphens')
    .optional(),
});

export type CmsProperty = z.infer<typeof cmsPropertySchema>;

export const cmsPropertiesHeroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  image: cmsPhotoSchema,
  primaryCta: cmsCtaLinkSchema,
});

export const cmsPropertiesIntroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(300),
});

export const cmsPropertiesFeaturedSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(300),
});

export const cmsPropertiesNoteSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(400),
  steps: z.array(cmsPillarSchema).min(1).max(5),
});

export const cmsPropertiesCtaSchema = z.object({
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(300),
  primaryCta: cmsCtaLinkSchema,
});

export const cmsPropertiesPageSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(300),
  hero: cmsPropertiesHeroSchema,
  intro: cmsPropertiesIntroSchema,
  featured: cmsPropertiesFeaturedSchema,
  note: cmsPropertiesNoteSchema,
  cta: cmsPropertiesCtaSchema,
});

export type CmsPropertiesPage = z.infer<typeof cmsPropertiesPageSchema>;

export const propertiesContentSchema = z.object({
  categories: z
    .array(cmsPropertyCategorySchema)
    .min(1, 'At least one category is required')
    .max(10, 'At most 10 categories'),
  properties: z.array(cmsPropertySchema).min(0).max(50),
  page: cmsPropertiesPageSchema,
});

export type PropertiesContent = z.infer<typeof propertiesContentSchema>;

// ---------------------------------------------------------------------------
// FAQs - mirrors `FAQS` in `apps/web/src/features/public/content/faqs.ts`.
// Audit: flat `FaqItem[]` (question/answer), no categories, order = array
// index, no search/filter, accordion `FAQAccordion` (multiple open allowed).
// Page wrapper: eyebrow/title + hero (eyebrow/lead/image/primaryCta) +
// intro (eyebrow/statement/body) + cta (title/lead/primaryCta.href/secondaryCta.to)
// + items. Hero image remains editable via CmsImageField (per Phase 4.1 Q2).
// ---------------------------------------------------------------------------

export const faqItemSchema = z.object({
  question: z
    .string()
    .min(1, 'Question is required')
    .max(120, 'Question must be 120 characters or less'),
  answer: z.string().min(1, 'Answer is required').max(600, 'Answer must be 600 characters or less'),
});

export type FaqItem = z.infer<typeof faqItemSchema>;

export const faqHeroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  lead: z.string().min(1).max(400),
  image: cmsPhotoSchema,
  primaryCta: cmsCtaLinkSchema,
});

export const faqIntroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  statement: z.string().min(1).max(80),
  body: z.string().min(1).max(600),
});

export const faqCtaSchema = z.object({
  title: z.string().min(1).max(80),
  lead: z.string().min(1).max(400),
  primaryCta: cmsCtaLinkSchema,
  secondaryCta: cmsCtaLinkSchema,
});

export const faqContentSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  hero: faqHeroSchema,
  intro: faqIntroSchema,
  cta: faqCtaSchema,
  items: z.array(faqItemSchema).min(1, 'At least one FAQ is required').max(20, 'At most 20 FAQs'),
});

export type FaqContent = z.infer<typeof faqContentSchema>;

// ---------------------------------------------------------------------------
// Contact - mirrors `CONTACT` in `apps/web/src/features/public/content/contact.ts`
// Audit: title + hero (eyebrow/image/primaryCta) + methods[] (icon/label/value/
// href) + form (heading/note/submitLabel) + cta (title/lead/primaryCta/
// secondaryCta) + detailsHeading + details[] (footer contact column). Method
// `href` may be tel:/mailto:/https:/http:/ or an internal `/` link; javascript:/
// data:/vbscript: are rejected. `details` is the Footer contact column SSOT.
// ---------------------------------------------------------------------------

export const contactMethodIconSchema = z.enum(['messenger', 'phone', 'email', 'location']);

export const contactMethodSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  value: z.string().min(1, 'Value is required').max(120, 'Value must be 120 characters or less'),
  icon: contactMethodIconSchema,
  href: z
    .string()
    .min(1, 'Link is required')
    .max(200, 'Link must be 200 characters or less')
    .refine(
      (v) => /^(https?:\/\/|tel:|mailto:|\/)/.test(v),
      'Use https://, tel:, mailto: or an internal / link',
    )
    .refine((v) => !/^(javascript|data|vbscript):/i.test(v), 'Unsafe link')
    .optional(),
  external: z.boolean().optional().default(false),
  featured: z.boolean().optional().default(false),
});

export type ContactMethod = z.infer<typeof contactMethodSchema>;

export const contactDetailSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  value: z.string().min(1, 'Value is required').max(200, 'Value must be 200 characters or less'),
});

export type ContactDetail = z.infer<typeof contactDetailSchema>;

export const contactHeroSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  image: cmsPhotoSchema,
  primaryCta: cmsCtaLinkSchema,
});

export const contactFormSchema = z.object({
  heading: z
    .string()
    .min(1, 'Heading is required')
    .max(80, 'Heading must be 80 characters or less'),
  note: z.string().min(1, 'Note is required').max(400, 'Note must be 400 characters or less'),
  submitLabel: z
    .string()
    .min(1, 'Submit label is required')
    .max(40, 'Submit label must be 40 characters or less'),
});

export const contactCtaSchema = z.object({
  title: z.string().min(1, 'Title is required').max(80, 'Title must be 80 characters or less'),
  lead: z.string().min(1, 'Lead is required').max(400, 'Lead must be 400 characters or less'),
  primaryCta: cmsCtaLinkSchema,
  secondaryCta: cmsCtaLinkSchema,
});

export const contactContentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(80, 'Title must be 80 characters or less'),
  hero: contactHeroSchema,
  methods: z
    .array(contactMethodSchema)
    .min(1, 'At least one contact method is required')
    .max(8, 'At most 8 contact methods'),
  form: contactFormSchema,
  cta: contactCtaSchema,
  detailsHeading: z
    .string()
    .min(1, 'Heading is required')
    .max(60, 'Heading must be 60 characters or less'),
  details: z
    .array(contactDetailSchema)
    .min(1, 'At least one contact detail is required')
    .max(6, 'At most 6 contact details'),
});

export type ContactContent = z.infer<typeof contactContentSchema>;

// ---------------------------------------------------------------------------
// Global - site-wide identity, navigation, footer, Messenger FAB, and SEO.
// Mirrors `SITE` (`site.ts`) + `LOGO` (`images.ts`) + `CONTACT.details`
// (`contact.ts`) + `index.html` meta. These are the only truly site-wide SSOTs
// consumed by `Header`/`Footer`/`MessengerButton` and the public `<head>`.
// Footer contact rows (`footer.contacts`) are the canonical home for what
// `CmsContactPage` §6 previews. All links are internal (`to` starts with `/`);
// the Messenger FAB and SEO live here so marketing can edit them without code.
// ---------------------------------------------------------------------------

export const globalNavItemSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  to: z
    .string()
    .min(1, 'Link is required')
    .max(200, 'Link must be 200 characters or less')
    .refine((v) => v.startsWith('/'), 'Internal link must start with /'),
});

export type GlobalNavItem = z.infer<typeof globalNavItemSchema>;

export const globalFooterContactSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  value: z.string().min(1, 'Value is required').max(200, 'Value must be 200 characters or less'),
});

export type GlobalFooterContact = z.infer<typeof globalFooterContactSchema>;

export const globalBrandSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Name must be 60 characters or less'),
  shortName: z
    .string()
    .min(1, 'Short name is required')
    .max(20, 'Short name must be 20 characters or less'),
  tagline: z
    .string()
    .min(1, 'Tagline is required')
    .max(200, 'Tagline must be 200 characters or less'),
  positioningLine: z
    .string()
    .min(1, 'Positioning line is required')
    .max(120, 'Positioning line must be 120 characters or less'),
});

export const globalMessengerSchema = z.object({
  url: z
    .string()
    .min(1, 'Messenger URL is required')
    .url('Enter a valid URL')
    .refine((v) => v.startsWith('https://'), 'Only https:// links are allowed'),
  label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  ariaLabel: z
    .string()
    .min(1, 'Accessible label is required')
    .max(120, 'Accessible label must be 120 characters or less'),
  hideOnAuth: z.boolean().optional().default(true),
});

export const globalThemeSchema = z.object({
  primary: z
    .string()
    .min(1, 'Primary color is required')
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be a #RRGGBB hex value'),
  secondary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be a #RRGGBB hex value')
    .optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be a #RRGGBB hex value')
    .optional(),
  accentLight: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be a #RRGGBB hex value')
    .optional(),
  brandDeep: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be a #RRGGBB hex value')
    .optional(),
});

export type GlobalTheme = z.infer<typeof globalThemeSchema>;

/** Optional per-page SEO override. When a field is empty the site-wide Global
 *  SEO value is used as the fallback. Title/description limits follow SERP best
 *  practice (shorter than the Global 120/300 limits). */
export const pageSeoSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(60, 'Title must be 60 characters or less')
    .optional(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(160, 'Description must be 160 characters or less')
    .optional(),
});

export type PageSeo = z.infer<typeof pageSeoSchema>;

export const globalSeoSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title must be 120 characters or less'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(300, 'Description must be 300 characters or less'),
  theme: globalThemeSchema,
  pages: z.object({
    home: pageSeoSchema.optional(),
    about: pageSeoSchema.optional(),
    properties: pageSeoSchema.optional(),
    faqs: pageSeoSchema.optional(),
    contact: pageSeoSchema.optional(),
    login: pageSeoSchema.optional(),
    register: pageSeoSchema.optional(),
    verify: pageSeoSchema.optional(),
    status: pageSeoSchema.optional(),
  }),
});

export const globalContentSchema = z.object({
  brand: globalBrandSchema,
  logo: cmsPhotoSchema,
  brandMark: cmsPhotoSchema,
  browserIcon: cmsPhotoSchema,
  nav: z
    .array(globalNavItemSchema)
    .min(1, 'At least one nav item is required')
    .max(8, 'At most 8 nav items'),
  authNav: z.array(globalNavItemSchema).min(0).max(4, 'At most 4 auth nav items'),
  footer: z.object({
    brandLine: z
      .string()
      .min(1, 'Brand line is required')
      .max(300, 'Brand line must be 300 characters or less'),
    exploreHeading: z
      .string()
      .min(1, 'Explore heading is required')
      .max(40, 'Explore heading must be 40 characters or less'),
    contactHeading: z
      .string()
      .min(1, 'Contact heading is required')
      .max(60, 'Contact heading must be 60 characters or less'),
    contacts: z
      .array(globalFooterContactSchema)
      .min(1, 'At least one contact detail is required')
      .max(6, 'At most 6 contact details'),
    bottomBar: z.object({
      legalSuffix: z
        .string()
        .min(1, 'Legal suffix is required')
        .max(120, 'Legal suffix must be 120 characters or less'),
      showTagline: z.boolean().optional().default(true),
    }),
  }),
  messenger: globalMessengerSchema,
  seo: globalSeoSchema,
});

export type GlobalContent = z.infer<typeof globalContentSchema>;

// ---------------------------------------------------------------------------
// Auth - marketing-editable copy + brand imagery for the member auth screens
// (Login / Register / Email verification / Application status), plus the auth
// brand mark and browser icon (favicon). Mirrors `AUTH` (`apps/web/src/features
// auth/content.ts`) so a future `GET/PUT /cms/auth` can serve the same shape.
// Each screen mirrors the `AuthLayout` contract (eyebrow/title/lead/brandTitle/
// brandLead + a brand panel image). `lead` is optional on Status (the public
// page renders a fixed review line, so the CMS value is an override).
// ---------------------------------------------------------------------------

export const authScreenCopySchema = z.object({
  eyebrow: z
    .string()
    .min(1, 'Eyebrow is required')
    .max(60, 'Eyebrow must be 60 characters or less'),
  title: z.string().min(1, 'Title is required').max(80, 'Title must be 80 characters or less'),
  lead: z
    .string()
    .min(1, 'Lead is required')
    .max(400, 'Lead must be 400 characters or less')
    .optional(),
  brandTitle: z
    .string()
    .min(1, 'Brand title is required')
    .max(120, 'Brand title must be 120 characters or less'),
  brandLead: z
    .string()
    .min(1, 'Brand lead is required')
    .max(400, 'Brand lead must be 400 characters or less'),
});

export type AuthScreenCopy = z.infer<typeof authScreenCopySchema>;

/** A single editable label + optional help text for a registration/login field. */
export const registerFieldLabelSchema = z.object({
  label: z.string().min(1, 'Label is required').max(60, 'Label must be 60 characters or less'),
  hint: z.string().max(200, 'Hint must be 200 characters or less').optional(),
});

export type RegisterFieldLabel = z.infer<typeof registerFieldLabelSchema>;

/** One yes/no qualification question (content only - rendered as a Yes/No select). */
export const registerQualificationQuestionSchema = z.object({
  id: z
    .string()
    .min(1, 'Question id is required')
    .max(40, 'Question id must be 40 characters or less'),
  question: z
    .string()
    .min(1, 'Question text is required')
    .max(200, 'Question must be 200 characters or less'),
  help: z.string().max(300, 'Help must be 300 characters or less').optional(),
});

export type RegisterQualificationQuestion = z.infer<typeof registerQualificationQuestionSchema>;

/** Qualification questions split by program track (Domestic / Abroad). The
 *  exact differences are business-owned (OD-001..005); the CMS only stores the
 *  editable question text per track. */
export const registerQualificationSchema = z.object({
  domestic: z.array(registerQualificationQuestionSchema).min(0).max(20, 'At most 20 questions'),
  abroad: z.array(registerQualificationQuestionSchema).min(0).max(20, 'At most 20 questions'),
});

export type RegisterQualification = z.infer<typeof registerQualificationSchema>;

export const loginContentSchema = z.object({
  image: cmsPhotoSchema,
  copy: authScreenCopySchema,
  fields: z.object({
    identifier: registerFieldLabelSchema,
    password: registerFieldLabelSchema,
  }),
  submitLabel: z
    .string()
    .min(1, 'Submit label is required')
    .max(40, 'Submit label must be 40 characters or less'),
  forgotPassword: z.object({
    label: z.string().min(1, 'Label is required').max(40, 'Label must be 40 characters or less'),
  }),
  registerPrompt: z.object({
    text: z.string().min(1, 'Text is required').max(80, 'Text must be 80 characters or less'),
    linkLabel: z
      .string()
      .min(1, 'Link label is required')
      .max(40, 'Link label must be 40 characters or less'),
  }),
});

export type LoginContent = z.infer<typeof loginContentSchema>;

export const registerContentSchema = z.object({
  image: cmsPhotoSchema,
  copy: authScreenCopySchema,
  stepTitles: z.object({
    programProfile: z
      .string()
      .min(1, 'Step title is required')
      .max(60, 'Step title must be 60 characters or less'),
    qualification: z
      .string()
      .min(1, 'Step title is required')
      .max(60, 'Step title must be 60 characters or less'),
    referral: z
      .string()
      .min(1, 'Step title is required')
      .max(60, 'Step title must be 60 characters or less'),
    governmentId: z
      .string()
      .min(1, 'Step title is required')
      .max(60, 'Step title must be 60 characters or less'),
    account: z
      .string()
      .min(1, 'Step title is required')
      .max(60, 'Step title must be 60 characters or less'),
  }),
  fields: z.object({
    programId: registerFieldLabelSchema,
    firstName: registerFieldLabelSchema,
    middleInitial: registerFieldLabelSchema,
    lastName: registerFieldLabelSchema,
    nameSuffix: registerFieldLabelSchema,
    dateOfBirth: registerFieldLabelSchema,
    gender: registerFieldLabelSchema,
    countryCode: registerFieldLabelSchema,
    address: registerFieldLabelSchema,
    phone: registerFieldLabelSchema,
    email: registerFieldLabelSchema,
    password: registerFieldLabelSchema,
    confirmPassword: registerFieldLabelSchema,
    referralCode: registerFieldLabelSchema,
    idDocument: registerFieldLabelSchema,
    consent: registerFieldLabelSchema,
  }),
  qualification: registerQualificationSchema,
  submitLabel: z
    .string()
    .min(1, 'Submit label is required')
    .max(40, 'Submit label must be 40 characters or less'),
  loginPrompt: z.object({
    text: z.string().min(1, 'Text is required').max(80, 'Text must be 80 characters or less'),
    linkLabel: z
      .string()
      .min(1, 'Link label is required')
      .max(40, 'Link label must be 40 characters or less'),
  }),
  verifyEmail: authScreenCopySchema,
  status: authScreenCopySchema,
});

export type RegisterContent = z.infer<typeof registerContentSchema>;
