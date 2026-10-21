import { requireUser, errorResponse } from "@/lib/auth";
import { searchLibrary, libraryInfo, readPages, quranSearch } from "@/lib/library";
import { rateLimit } from "@/lib/ratelimit";

export async function GET(req: Request) {
  try {
    const u = await requireUser();
    rateLimit("lib:" + u.id, 60, 60_000);
    const sp = new URL(req.url).searchParams;
    const q = sp.get("q")?.trim() || "";
    const book = Number(sp.get("book") || 0);
    const page = Number(sp.get("page") || 0);
    if (book && page) return Response.json({ pages: readPages(book, page, 0) });
    if (!q) {
      const info = libraryInfo();
      return Response.json(info.ready ? { ready: true, books: info.books, meta: info.meta } : { ready: false });
    }
    const books = sp.get("books")?.split(",").map(Number).filter(Boolean);
    return Response.json({ results: searchLibrary(q, { books, limit: 20 }), ayat: quranSearch(q, 5) });
  } catch (e) {
    return errorResponse(e);
  }
}
