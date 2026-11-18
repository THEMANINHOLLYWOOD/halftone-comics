// The little a share page needs to know about a comic, cached for a few
// minutes so link previews are cheap and a poster that lands later shows up.

import { cacheLife } from "next/cache";
import { getComic } from "./library";
import { COMIC_ID, shareMeta } from "./share";

export async function comicMeta(id: string): Promise<ReturnType<typeof shareMeta> | null> {
  "use cache";
  cacheLife("minutes");
  if (!COMIC_ID.test(id)) return null;
  try {
    const comic = await getComic(id);
    return shareMeta(comic);
  } catch {
    return null;
  }
}
