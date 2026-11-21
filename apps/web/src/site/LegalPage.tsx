import { LEGAL_UPDATED } from "./config";
import { LEGAL_DOCS, type LegalSlug } from "./legal";
import { SiteLayout } from "./SiteLayout";

export const LegalPage = ({ slug }: { slug: LegalSlug }) => {
  const doc = LEGAL_DOCS[slug];

  return (
    <SiteLayout>
      <article className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="text-sm text-slate-500">Last updated {LEGAL_UPDATED}</p>
        </header>
        {doc.sections.map((section) => {
          return (
            <section key={section.heading} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => {
                return (
                  <p key={paragraph} className="text-sm leading-6 text-slate-700">
                    {paragraph}
                  </p>
                );
              })}
            </section>
          );
        })}
      </article>
    </SiteLayout>
  );
};
