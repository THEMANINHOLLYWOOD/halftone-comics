import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Studio } from "@/components/Studio";
import { BRAND } from "@/lib/brand";
import { comicMeta } from "@/lib/comic-meta";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await comicMeta(id);
  if (!meta) notFound();
  const card = { url: meta.image, width: 1200, height: 630, alt: meta.title };
  return {
    title: `${meta.title} — ${BRAND.name}`,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, images: [card], type: "article" },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description, images: [card] },
  };
}

async function Opened({ params }: Props) {
  const { id } = await params;
  if (!(await comicMeta(id))) notFound();
  return <Studio initialId={id} />;
}

/** A comic's own address: the studio, opened on that comic. */
export default function ComicPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="h-dvh w-full bg-stage" />}>
      <Opened params={params} />
    </Suspense>
  );
}
