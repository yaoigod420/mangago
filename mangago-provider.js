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
        const url = `${this.baseUrl}/home/search/?search=${encodeURIComponent(opts.query)}&searchby=book_name&adult=true`
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Referer": this.baseUrl + "/",
                "User-Agent": "Mozilla/5.0",
            },
        })
        const html = await response.text()
        const results: SearchResult[] = []
        const links = html.matchAll(/<a[^>]+href=["']\/read-manga\/([^/'"]+)["'][^>]*>([\s\S]*?)<\/a>/gi)

        for (const match of links) {
            const id = match[1]
            const block = match[2]
            const title = this.cleanText(block)
            if (!title) continue
            if (results.some((item) => item.id === id)) continue
            results.push({
                id,
                title,
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
                "Referer": this.baseUrl + "/",
                "User-Agent": "Mozilla/5.0",
            },
        })
        const html = await response.text()
        const chapters: ChapterDetails[] = []
        const links = html.matchAll(/<a[^>]+href=["']\/read-manga\/[^/'"]+\/([^/'"]+)["'][^>]*>([\s\S]*?)<\/a>/gi)

        for (const match of links) {
            const number = match[1]
            if (!/\d/.test(number)) continue
            const id = `${mangaId}/${number}`
            if (chapters.some((chapter) => chapter.id === id)) continue
            chapters.push({
                id,
                url: `${this.baseUrl}/read-manga/${mangaId}/${number}/`,
                title: this.cleanText(match[2]) || `Chapter ${number}`,
                chapter: number,
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
        const mangaId = chapterId.slice(0, separator)
        const chapter = chapterId.slice(separator + 1)
        const pageUrl = `${this.baseUrl}/read-manga/${mangaId}/${chapter}/`
        const response = await fetch(pageUrl, {
            method: "GET",
            headers: {
                "Referer": `${this.baseUrl}/read-manga/${mangaId}/`,
                "User-Agent": "Mozilla/5.0",
            },
        })
        const html = await response.text()
        const pages: ChapterPage[] = []
        const seen: { [key: string]: boolean } = {}

        const addPage = (raw: string) => {
            const url = this.decodeHtml(raw)
            if (!url || !/^https?:\/\//i.test(url) || seen[url]) return
            seen[url] = true
            pages.push({
                url,
                index: pages.length,
                headers: { "Referer": pageUrl },
            })
        }

        for (const match of html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)) {
            addPage(match[1])
        }
        for (const match of html.matchAll(/(?:pic_arry|images|pages)\s*=\s*\[([\s\S]*?)\]/gi)) {
            for (const item of match[1].matchAll(/["']([^"']+)["']/g)) addPage(item[1])
        }
        return pages
    }

    private cleanText(value: string): string {
        return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()
    }

    private decodeHtml(value: string): string {
        return value.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    }

    private chapterNumber(value: string): number {
        const match = value.match(/\d+(?:\.\d+)?/)
        return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
    }
}
