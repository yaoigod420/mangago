/// <reference path="./manga-provider.d.ts" />

/**
 * Seanime Manga Provider Extension for MangaGo.me
 * 
 * This extension scrapes MangaGo.me to provide manga chapters and pages.
 * Note: MangaGo uses encrypted/obfuscated image URLs that may require
 * additional decryption logic. This is a basic template.
 */

class Provider {
    private baseUrl = "https://www.mangago.me"
    
    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    /**
     * Search for manga by title
     */
    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const url = `${this.baseUrl}/home/search/?search=${query}&searchby=book_name&adult=true`
        
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Referer": this.baseUrl,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })
        
        if (!response.ok) {
            throw new Error(`Search failed with status ${response.status}`)
        }
        
        const html = await response.text()
        const results: SearchResult[] = []
        
        // Parse search results from HTML
        // MangaGo search results are in format: /read-manga/{manga_id}/
        const mangaRegex = /<a\s+href="\/read-manga\/([^\/]+)\/"[^>]*>\s*<div[^>]*class="[^"]*manga_pic[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/g
        let match
        
        while ((match = mangaRegex.exec(html)) !== null) {
            const id = match[1]
            const image = match[2]
            const title = match[3].trim()
            
            results.push({
                id: id,
                title: title,
                image: image.startsWith("http") ? image : `${this.baseUrl}${image}`,
                year: undefined,
                synonyms: [],
            })
        }
        
        return results
    }

    /**
     * Find all chapters for a manga
     */
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const url = `${this.baseUrl}/read-manga/${mangaId}/`
        
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Referer": this.baseUrl,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })
        
        if (!response.ok) {
            throw new Error(`Failed to fetch chapters with status ${response.status}`)
        }
        
        const html = await response.text()
        const chapters: ChapterDetails[] = []
        
        // Parse chapter list from dropdown or chapter list
        // MangaGo typically has chapters in a select element or list
        const chapterRegex = /<a\s+href="\/read-manga\/[^\/]+\/(\d+(?:\.\d+)?(?:-\d+)?)\/"[^>]*>([^<]+)<\/a>/g
        let match
        let index = 0
        
        while ((match = chapterRegex.exec(html)) !== null) {
            const chapterNum = match[1]
            const chapterTitle = match[2].trim()
            
            chapters.push({
                id: `${mangaId}/${chapterNum}`,
                url: `${this.baseUrl}/read-manga/${mangaId}/${chapterNum}/`,
                title: chapterTitle || `Chapter ${chapterNum}`,
                chapter: chapterNum,
                index: index++,
                scanlator: undefined,
                language: "en",
                rating: undefined,
                updatedAt: undefined,
            })
        }
        
        // Reverse to get ascending order (newest first on Mangago)
        chapters.reverse()
        chapters.forEach((ch, i) => ch.index = i)
        
        return chapters
    }

    /**
     * Find all pages in a chapter
     * 
     * IMPORTANT: MangaGo uses encrypted/obfuscated image URLs.
     * The actual image loading requires JavaScript execution and decryption.
     * This is a simplified version - you may need to add decryption logic.
     */
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const [mangaId, chapterNum] = chapterId.split("/")
        const url = `${this.baseUrl}/read-manga/${mangaId}/${chapterNum}/`
        
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Referer": this.baseUrl,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        })
        
        if (!response.ok) {
            throw new Error(`Failed to fetch chapter pages with status ${response.status}`)
        }
        
        const html = await response.text()
        const pages: ChapterPage[] = []
        
        // Method 1: Try to extract image URLs from HTML directly
        // Look for img tags with class containing "img_page" or similar
        const imageRegex = /<img[^>]*src="([^"]+)"[^>]*class="[^"]*img_page[^"]*"[^>]*>/g
        let match
        let index = 0
        
        while ((match = imageRegex.exec(html)) !== null) {
            const imageUrl = match[1]
            
            pages.push({
                url: imageUrl,
                index: index++,
                headers: {
                    "Referer": url,
                },
            })
        }
        
        // Method 2: If no images found, try to extract from JavaScript variables
        // MangaGo often stores image data in encrypted JavaScript variables
        if (pages.length === 0) {
            // Look for pic_arry or similar variables that contain image data
            const picArryMatch = html.match(/pic_arry\s*=\s*\[([^\]]+)\]/)
            if (picArryMatch) {
                const imageUrls = picArryMatch[1].match(/['"]([^'"]+)['"]/g)
                if (imageUrls) {
                    imageUrls.forEach((imgUrl, idx) => {
                        const cleanUrl = imgUrl.replace(/['"]/g, '')
                        pages.push({
                            url: cleanUrl,
                            index: idx,
                            headers: {
                                "Referer": url,
                            },
                        })
                    })
                }
            }
        }
        
        // Method 3: Try to find image_prefix and construct URLs
        if (pages.length === 0) {
            const imgPrefixMatch = html.match(/img_prefix\s*=\s*['"]([^'"]+)['"]/)
            if (imgPrefixMatch) {
                const imgPrefix = imgPrefixMatch[1]
                const picArryMatch2 = html.match(/pic_arry\s*=\s*\[([^\]]+)\]/)
                if (picArryMatch2) {
                    const imageUrls = picArryMatch2[1].match(/['"]([^'"]+)['"]/g)
                    if (imageUrls) {
                        imageUrls.forEach((imgUrl, idx) => {
                            const cleanUrl = imgUrl.replace(/['"]/g, '')
                            pages.push({
                                url: `${imgPrefix}${cleanUrl}`,
                                index: idx,
                                headers: {
                                    "Referer": url,
                                },
                            })
                        })
                    }
                }
            }
        }
        
        return pages
    }
}