// Houzz Products Scraper - CheerioCrawler implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            query = 'sofa',
            results_wanted: RESULTS_WANTED_RAW = 20,
            max_pages: MAX_PAGES_RAW = 20,
            collectDetails = true,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 999;

        const toAbs = (href, base = 'https://shophouzz.com') => {
            try { return new URL(href, base).href; } catch { return null; }
        };

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const extractPrice = (text) => {
            if (!text) return null;
            const match = text.match(/\$[\d,]+(?:\.\d{2})?/);
            return match ? match[0] : null;
        };

        const buildStartUrl = (q, page = 1) => {
            const u = new URL('https://shophouzz.com/search');
            if (q) u.searchParams.set('q', String(q).trim());
            if (page > 1) u.searchParams.set('page', String(page));
            return u.href;
        };

        const searchQuery = query?.trim() || 'sofa';
        const initial = [buildStartUrl(searchQuery, 1)];

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenUrls = new Set();
        let batchBuffer = [];

        async function pushBatch(force = false) {
            if (batchBuffer.length >= 10 || (force && batchBuffer.length > 0)) {
                await Dataset.pushData(batchBuffer);
                log.info(`✓ Pushed ${batchBuffer.length} products (Total: ${saved})`);
                batchBuffer = [];
            }
        }

        function extractProductFromCard($, card) {
            const $card = $(card);

            // Extract title and URL from the hover:underline link
            const titleLink = $card.find('a.hover\\:underline').first();
            if (!titleLink.length) return null;

            const title = titleLink.text().trim() || null;
            const href = titleLink.attr('href');
            if (!href) return null;

            const url = toAbs(href);
            if (!url || seenUrls.has(url)) return null;
            seenUrls.add(url);

            // Extract brand (look for text starting with "by ")
            let brand = null;
            $card.find('div, p, span').each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('by ')) {
                    brand = text.replace(/^by\s+/i, '').trim();
                    return false;
                }
            });

            // Extract price (look for elements containing $)
            let price = null;
            let original_price = null;
            $card.find('span, p, div').each((_, el) => {
                const text = $(el).text().trim();
                if (text.startsWith('$')) {
                    if (!price) {
                        price = text;
                    } else if (!original_price) {
                        original_price = text;
                    }
                }
            });

            // Extract image
            const img = $card.find('img').first();
            const image_url = img.attr('src') || img.attr('data-src') || null;

            return {
                title,
                brand,
                price,
                original_price,
                image_url,
                url,
                rating: null,
                review_count: null,
                description: null,
                specifications: null,
            };
        }

        function extractProductsFromPage($, baseUrl) {
            const products = [];
            // Use the correct selector for Houzz product cards
            $('div[class*="md:p-"]').each((_, card) => {
                const product = extractProductFromCard($, card);
                if (product) products.push(product);
            });
            return products;
        }

        function extractDetailPageData($) {
            const data = {};

            // Title
            data.title = $('h1').first().text().trim() || null;

            // Brand
            const brandLink = $('a.u-link, a[class*="brand"]').first();
            data.brand = brandLink.text().trim() || null;
            if (!data.brand) {
                $('*').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.toLowerCase().startsWith('by ')) {
                        data.brand = text.replace(/^by\s+/i, '').trim();
                        return false;
                    }
                });
            }

            // Price
            const priceElements = $('.product-price, [class*="price"]');
            priceElements.each((_, el) => {
                const text = $(el).text().trim();
                if (text.includes('$')) {
                    const prices = text.match(/\$[\d,]+(?:\.\d{2})?/g);
                    if (prices && prices.length > 0) {
                        data.price = prices[0];
                        if (prices.length > 1) data.original_price = prices[1];
                    }
                    return false;
                }
            });

            // Rating and reviews
            const ratingEl = $('[class*="rating"], [class*="star"]').first();
            if (ratingEl.length) {
                const ratingText = ratingEl.text().trim();
                const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
                if (ratingMatch) data.rating = parseFloat(ratingMatch[1]);
            }

            const reviewEl = $('[class*="review"]').first();
            if (reviewEl.length) {
                const reviewText = reviewEl.text().trim();
                const reviewMatch = reviewText.match(/(\d+)/);
                if (reviewMatch) data.review_count = parseInt(reviewMatch[1], 10);
            }

            // Description
            const descEl = $('#product-description, .product-description, [class*="description"]').first();
            if (descEl.length) {
                data.description_html = descEl.html()?.trim() || null;
                data.description = cleanText(data.description_html);
            }

            // Specifications
            const specsEl = $('#specifications, .specifications, [class*="spec"]').first();
            if (specsEl.length) {
                data.specifications = cleanText(specsEl.html());
            }

            // Images
            const images = [];
            $('img[src*="product"], img[data-src*="product"]').each((_, img) => {
                const src = $(img).attr('src') || $(img).attr('data-src');
                if (src) images.push(src);
            });
            if (images.length > 0) data.image_url = images[0];

            return data;
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 10,
            requestHandlerTimeoutSecs: 90,
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;

                if (label === 'LIST') {
                    const products = extractProductsFromPage($, request.url);
                    crawlerLog.info(`LIST page ${pageNo} → found ${products.length} products`);

                    if (collectDetails) {
                        const remaining = RESULTS_WANTED - saved;
                        const toEnqueue = products.slice(0, Math.max(0, remaining));
                        if (toEnqueue.length) {
                            await enqueueLinks({
                                urls: toEnqueue.map(p => p.url),
                                userData: { label: 'DETAIL', product: toEnqueue }
                            });
                        }
                    } else {
                        const remaining = RESULTS_WANTED - saved;
                        const toPush = products.slice(0, Math.max(0, remaining));
                        if (toPush.length) {
                            batchBuffer.push(...toPush);
                            saved += toPush.length;
                            await pushBatch();
                        }
                    }

                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const currentUrl = new URL(request.url);
                        const nextPage = pageNo + 1;
                        currentUrl.searchParams.set('page', String(nextPage));
                        await enqueueLinks({
                            urls: [currentUrl.href],
                            userData: { label: 'LIST', pageNo: nextPage }
                        });
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) return;
                    try {
                        const detailData = extractDetailPageData($);

                        const item = {
                            title: detailData.title || null,
                            brand: detailData.brand || null,
                            price: detailData.price || null,
                            original_price: detailData.original_price || null,
                            image_url: detailData.image_url || null,
                            rating: detailData.rating || null,
                            review_count: detailData.review_count || null,
                            description: detailData.description || null,
                            specifications: detailData.specifications || null,
                            url: request.url,
                        };

                        batchBuffer.push(item);
                        saved++;
                        await pushBatch();
                    } catch (err) {
                        crawlerLog.error(`DETAIL ${request.url} failed: ${err.message}`);
                    }
                }
            }
        });

        await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 1 } })));
        await pushBatch(true); // Push remaining items
        log.info(`✅ Finished. Saved ${saved} products`);
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
