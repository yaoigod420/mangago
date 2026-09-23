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
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })

        const body = await response.text()

        throw new Error(
            `MangaGo diagnostic\n` +
            `HTTP: ${response.status}\n` +
            `URL: ${url}\n` +
            `Response start:\n${body.slice(0, 2500)}`
        )
    }

    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        return []
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        return []
    }
}
