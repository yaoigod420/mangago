/// <reference path="./manga-provider.d.ts" />

class Provider {
    private baseUrl = "https://www.mangago.me"

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.baseUrl}/r/l_search/?name=${encodeURIComponent(opts.query)}`
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": this.baseUrl + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            },
        })

        if (!response.ok) {
            throw new Error(`MangaGo search failed: HTTP ${response.status}`)
        }

        const html = await response.text()
        const results: SearchResult[] = []
        const seen: { [key: string]: boolean } = {}
        const resultLinks = html.matchAll(/<a\b[^>]*href=["']\/read-manga\/([^\/'"?#]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)

        for (const match of resultLinks) {
            const id = match[1]
            const block = match[2]
            if (seen[id]) continue
            seen[id] = true

            const imageMatch = block.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/i)
            const titleMatch = block.match(/<(?:h[1-6]|strong|span|p)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|span|p)>/i)
            const title = this.cleanText(titleMatch ? titleMatch[1] : block)

            if (!title) continue

            results.push({
                id,
                title,
                image: imageMatch ? this.absoluteUrl(this.decodeHtml(imageMatch[1])) : undefined,
                synonyms: [],
            })
        }

        return results
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const pageUrl = `${this.baseUrl}/read-manga/${mangaId}/`
        const response = await fetch(pageUrl, {
            method: "GET",
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": this.baseUrl + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })

        if (!response.ok) {
            throw new Error(`MangaGo chapter lookup failed: HTTP ${response.status}`)
        }

        const html = await response.text()
        const chapters: ChapterDetails[] = []
        const seen: { [key: string]: boolean } = {}
        const chapterLinks = html.matchAll(/<a\b[^>]*href=["']\/read-manga\/[^\/'"?#]+\/([^\/'"?#]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)

        for (const match of chapterLinks) {
            const chapterId = match[1]
            if (!/\d/.test(chapterId)) continue
            if (seen[chapterId]) continue
            seen[chapterId] = true

            chapters.push({
                id: `${mangaId}/${chapterId}`,
                url: `${this.baseUrl}/read-manga/${mangaId}/${chapterId}/`,
                title: this.cleanText(match[2]) || `Chapter ${chapterId}`,
                chapter: chapterId,
                index: 0,
                language: "en",
            })
        }

        chapters.sort((a, b) => this.chapterNumber(a.chapter) - this.chapterNumber(b.chapter))
        chapters.forEach((chapter, index) => chapter.index = index)
        return chapters
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const separator = chapterId.indexOf("/")
        if (separator < 1) throw new Error("Invalid MangaGo chapter ID")

        const mangaId = chapterId.slice(0, separator)
        const chapter = chapterId.slice(separator + 1)
        const pageUrl = `${this.baseUrl}/read-manga/${mangaId}/${chapter}/`
        const response = await fetch(pageUrl, {
            method: "GET",
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": `${this.baseUrl}/read-manga/${mangaId}/`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })

        if (!response.ok) {
            throw new Error(`MangaGo page lookup failed: HTTP ${response.status}`)
        }

        const html = await response.text()
        const pages: ChapterPage[] = []
        const seen: { [key: string]: boolean } = {}

        const addPage = (raw: string) => {
            const imageUrl = this.absoluteUrl(this.decodeHtml(raw))
            if (!/^https?:\/\//i.test(imageUrl) || seen[imageUrl]) return
            if (/\.(?:css|js|svg|ico)(?:\?|$)/i.test(imageUrl)) return
            seen[imageUrl] = true
            pages.push({
                url: imageUrl,
                index: pages.length,
                headers: { "Referer": pageUrl },
            })
        }

        for (const match of html.matchAll(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
            addPage(match[1])
        }

        for (const match of html.matchAll(/(?:pic_arry|images|pages)\s*=\s*\[([\s\S]*?)\]/gi)) {
            for (const item of match[1].matchAll(/["']([^"']+)["']/g)) {
                addPage(item[1])
            }
        }

        return pages
    }

    private cleanText(value: string): string {
        return value
            .replace(/<[^>]*>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim()
    }

    private decodeHtml(value: string): string {
        return value
            .replace(/&amp;/g, "&")
            .replace(/&#x2F;/gi, "/")
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
    }

    private absoluteUrl(value: string): string {
        if (/^https?:\/\//i.test(value)) return value
        if (value.startsWith("//")) return `https:${value}`
        if (value.startsWith("/")) return `${this.baseUrl}${value}`
        return `${this.baseUrl}/${value}`
    }

    private chapterNumber(value: string): number {
        const match = value.match(/\d+(?:\.\d+)?/)
        return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
    }
}
