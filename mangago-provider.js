/// <reference path="./manga-provider.d.ts" />
/// <reference path="./core.d.ts" />

type MangaGoSearchItem = {
    id: string;
    title: string;
    image?: string;
};

class Provider {
    private baseUrl = "https://www.mangago.me";

    getSettings(): Settings {
        return {
            supportsMultiScanlator: false,
            supportsMultiLanguage: false,
        };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.baseUrl}/r/l_search/?name=${encodeURIComponent(opts.query)}`;
        console.debug("mangago: Searching", { query: opts.query, url });

        const response = await fetch(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: `${this.baseUrl}/`,
            },
        });

        if (!response.ok) {
            console.error("mangago: Search request failed", { status: response.status });
            throw new Error(`MangaGo search failed: HTTP ${response.status}`);
        }

        const html = await response.text();
        const items = this.parseSearchResults(html);
        console.debug("mangago: Search results parsed", { count: items.length });

        return items.map((item) => ({
            id: item.id,
            title: item.title,
            image: item.image,
            synonyms: [],
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const url = `${this.baseUrl}/read-manga/${id}/`;
        console.debug("mangago: Finding chapters", { mangaId: id, url });

        const response = await fetch(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: `${this.baseUrl}/`,
            },
        });

        if (!response.ok) {
            console.error("mangago: Chapter request failed", { status: response.status });
            throw new Error(`MangaGo chapter lookup failed: HTTP ${response.status}`);
        }

        const html = await response.text();
        const ret: ChapterDetails[] = [];
        const seen: Record<string, boolean> = {};
        const chapterLinks = html.matchAll(/<a\b[^>]*href=["']\/read-manga\/[^\/'"?#]+\/([^\/'"?#]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi);

        for (const match of chapterLinks) {
            const chapterId = match[1];
            if (!/\d/.test(chapterId) || seen[chapterId]) continue;
            seen[chapterId] = true;

            ret.push({
                id: `${id}/${chapterId}`,
                url: `${this.baseUrl}/read-manga/${id}/${chapterId}/`,
                title: this.cleanText(match[2]) || `Chapter ${chapterId}`,
                index: 0,
                chapter: chapterId,
            });
        }

        ret.sort((a, b) => this.chapterNumber(a.chapter) - this.chapterNumber(b.chapter));
        ret.forEach((chapter, index) => chapter.index = index);
        console.debug("mangago: Chapters parsed", { mangaId: id, count: ret.length });
        return ret;
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const separator = id.indexOf("/");
        if (separator < 1) throw new Error("Invalid MangaGo chapter ID");

        const mangaId = id.slice(0, separator);
        const chapterId = id.slice(separator + 1);
        const url = `${this.baseUrl}/read-manga/${mangaId}/${chapterId}/`;
        console.debug("mangago: Finding chapter pages", { chapterId: id, url });

        const response = await fetch(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: `${this.baseUrl}/read-manga/${mangaId}/`,
            },
        });

        if (!response.ok) {
            console.error("mangago: Page request failed", { status: response.status });
            throw new Error(`MangaGo page lookup failed: HTTP ${response.status}`);
        }

        const html = await response.text();
        const ret: ChapterPage[] = [];
        const seen: Record<string, boolean> = {};

        const addPage = (raw: string) => {
            const pageUrl = this.absoluteUrl(this.decodeHtml(raw));
            if (!/^https?:\/\//i.test(pageUrl) || seen[pageUrl]) return;
            if (/\.(?:css|js|svg|ico)(?:\?|$)/i.test(pageUrl)) return;
            seen[pageUrl] = true;
            ret.push({
                url: pageUrl,
                index: ret.length,
                headers: { Referer: url },
            });
        };

        for (const match of html.matchAll(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
            addPage(match[1]);
        }
        for (const match of html.matchAll(/(?:pic_arry|images|pages)\s*=\s*\[([\s\S]*?)\]/gi)) {
            for (const item of match[1].matchAll(/["']([^"']+)["']/g)) {
                addPage(item[1]);
            }
        }

        console.debug("mangago: Chapter pages parsed", { chapterId: id, count: ret.length });
        return ret;
    }

    private parseSearchResults(html: string): MangaGoSearchItem[] {
        const ret: MangaGoSearchItem[] = [];
        const seen: Record<string, boolean> = {};

        const push = (id: string, titleSource: string, imageSource?: string) => {
            const title = this.cleanText(titleSource);
            if (!id || !title || seen[id]) return;
            seen[id] = true;
            ret.push({
                id,
                title,
                image: imageSource ? this.absoluteUrl(this.decodeHtml(imageSource)) : undefined,
            });
        };

        // Handles search-result cards where the manga URL and title/image are inside one anchor.
        for (const match of html.matchAll(/<a\b[^>]*href=["'](?:https?:\/\/www\.mangago\.me)?\/read-manga\/([^\/'"?#]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)) {
            const id = match[1];
            const block = match[2];
            const imageMatch = block.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/i);
            const titleMatch = block.match(/<(?:h[1-6]|strong|span|p|b)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|span|p|b)>/i);
            push(id, titleMatch ? titleMatch[1] : block, imageMatch ? imageMatch[1] : undefined);
        }

        // Handles result cards where the title is in a sibling element rather than inside the link.
        for (const match of html.matchAll(/href=["'](?:https?:\/\/www\.mangago\.me)?\/read-manga\/([^\/'"?#]+)\/?["'][^>]*[\s\S]{0,1200}?<(?:h[1-6]|strong|span|p|b)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|span|p|b)>/gi)) {
            push(match[1], match[2]);
        }

        return ret;
    }

    private cleanText(value: string): string {
        return value
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();
    }

    private decodeHtml(value: string): string {
        return value
            .replace(/&amp;/g, "&")
            .replace(/&#x2F;/gi, "/")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"');
    }

    private absoluteUrl(value: string): string {
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith("//")) return `https:${value}`;
        if (value.startsWith("/")) return `${this.baseUrl}${value}`;
        return `${this.baseUrl}/${value}`;
    }

    private chapterNumber(value: string): number {
        const match = value.match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
    }
}
